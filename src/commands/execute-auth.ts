import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CliError } from "../core/errors.js";
import { decodeStorageStateBase64, readStorageState, resolveStateEnvValue, sessionCookies, writeStorageState } from "../core/auth.js";
import { describeDryRun, requireConfirmation } from "../core/safety.js";
import { authenticatedRequest, joinSubstackUrl } from "../clients/authenticated.js";
import { captureFromCdp } from "../browser/session.js";
import { hostBrowser } from "../browser/host.js";

type Options = Record<string, unknown>;
type Globals = Record<string, unknown>;
function stringOption(options: Options, names: string[]): string | undefined { for (const name of names) { const value = options[name]; if (typeof value === "string" && value.length > 0) return value; } return undefined; }
function requiredString(options: Options, names: string[], label: string): string { const value = stringOption(options, names); if (!value) throw new CliError("INVALID_ARGUMENT", `${label} is required.`, 2, false); return value; }
function globalStatePath(globals: Globals): string { return typeof globals.state === "string" && globals.state ? globals.state : path.join(os.homedir(), ".local/share/noriagent/substack-storage-state.json"); }
async function fileExists(filePath: string): Promise<boolean> { try { await access(filePath); return true; } catch { return false; } }

async function executeImport(options: Options, globals: Globals): Promise<{ data: unknown }> {
  requireConfirmation(options.confirm, "Imports authenticated browser cookies into an owner-only local file.");
  const destination = globalStatePath(globals);
  const encoded = stringOption(options, ["base64"]) ?? resolveStateEnvValue(options.stateEnv ?? globals.stateEnv);
  const json = encoded ? decodeStorageStateBase64(encoded).json : await readFile(requiredString(options, ["input", "file"], "Input storage-state file"), "utf8");
  const state = await writeStorageState(destination, json);
  return { data: { statePath: destination, cookieCount: state.cookies.length, sessionCookieCount: sessionCookies(state).length } };
}

async function executeExport(globals: Globals): Promise<{ data: unknown }> {
  const source = globalStatePath(globals);
  const { json, state } = await readStorageState(source);
  return { data: { base64: Buffer.from(json, "utf8").toString("base64"), cookieCount: state.cookies.length } };
}

async function executeStatus(globals: Globals): Promise<{ data: unknown }> {
  const encoded = resolveStateEnvValue(globals.stateEnv);
  if (encoded) { const { state } = decodeStorageStateBase64(encoded); return { data: { authenticated: sessionCookies(state).length > 0, source: "environment", cookieCount: state.cookies.length } }; }
  const source = globalStatePath(globals);
  if (!await fileExists(source)) return { data: { authenticated: false, source: null, statePath: source, cookieCount: 0 } };
  const { state } = await readStorageState(source);
  return { data: { authenticated: sessionCookies(state).length > 0, source, cookieCount: state.cookies.length, sessionCookieCount: sessionCookies(state).length } };
}

async function executeAuth(operation: string, options: Options, globals: Globals): Promise<{ data: unknown }> {
  if (operation === "import") return executeImport(options, globals);
  if (operation === "export") return executeExport(globals);
  if (operation === "status") return executeStatus(globals);
  if (operation === "capture") {
    requireConfirmation(options.confirm, "Captures authenticated Substack cookies from a Chromium session.");
    return { data: await captureFromCdp(stringOption(options, ["cdp"]) ?? "http://127.0.0.1:9222", globalStatePath(globals)) };
  }
  if (operation === "host") {
    requireConfirmation(options.confirm, options.stop === true ? "Stops the hosted Substack sign-in bridge." : "Starts a browser and hosted noVNC sign-in bridge.");
    return { data: await hostBrowser({ stop: options.stop === true, sessionUrl: stringOption(options, ["sessionUrl"]), browser: stringOption(globals, ["browser"]) }) };
  }
  throw new CliError("UNSUPPORTED_OPERATION", `Unsupported auth operation: ${operation}`, 2, false);
}

async function executePost(operation: string, options: Options, globals: Globals): Promise<{ data: unknown; dryRun?: boolean }> {
  const origin = requiredString(options, ["publicationUrl", "url"], "Publication URL");
  const id = requiredString(options, ["draftId", "id", "postId"], "Draft ID");
  if (operation === "delete") {
    requireConfirmation(options.confirm, `Deletes draft ${id} from ${origin}.`);
    return { data: await authenticatedRequest({ url: joinSubstackUrl(origin, `/api/v1/drafts/${encodeURIComponent(id)}`), method: "DELETE", globals }) };
  }
  if (operation === "publish") {
    const send = options.sendEmail === true;
    const url = joinSubstackUrl(origin, `/api/v1/drafts/${encodeURIComponent(id)}/publish`);
    const body = { send, share_automatically: false };
    const impact = send ? `Publishes draft ${id} and emails subscribers.` : `Publishes draft ${id} without emailing subscribers.`;
    if (options.dryRun === true) return describeDryRun({ method: "PUT", url, body, impact });
    requireConfirmation(options.confirm, impact);
    return { data: await authenticatedRequest({ url, method: "PUT", body, globals }) };
  }
  throw new CliError("UNSUPPORTED_OPERATION", `Unsupported post operation: ${operation}`, 2, false);
}

export async function executeAuthCommand(family: string, operation: string, options: Options, globals: Globals): Promise<{ data: unknown; dryRun?: boolean }> {
  if (family === "auth") return executeAuth(operation, options, globals);
  if (family === "profile" && operation === "me") return { data: await authenticatedRequest({ url: joinSubstackUrl(typeof globals.accountOrigin === "string" ? globals.accountOrigin : "https://substack.com", "/api/v1/user/profile/self"), globals }) };
  if (family === "post") return executePost(operation, options, globals);
  throw new CliError("UNSUPPORTED_OPERATION", `Unsupported authenticated command family: ${family}`, 2, false);
}
