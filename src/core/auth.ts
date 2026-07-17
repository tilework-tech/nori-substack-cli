import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CliError } from "./errors.js";

export interface StorageStateCookie {
  name: string; value: string; domain: string; path: string; expires?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "Strict" | "Lax" | "None";
}
export interface PlaywrightStorageState {
  cookies: StorageStateCookie[];
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
}

function invalidStorageState(message: string): CliError { return new CliError("INVALID_STORAGE_STATE", message, 2, false); }

export function parseStorageState(value: string): PlaywrightStorageState {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw invalidStorageState("Storage state is not valid JSON."); }
  if (parsed === null || typeof parsed !== "object" || !Array.isArray((parsed as { cookies?: unknown }).cookies) || !Array.isArray((parsed as { origins?: unknown }).origins)) {
    throw invalidStorageState("Storage state must be a Playwright storage-state object with cookies and origins arrays.");
  }
  for (const cookie of (parsed as PlaywrightStorageState).cookies) {
    if (cookie === null || typeof cookie !== "object" || typeof cookie.name !== "string" || typeof cookie.value !== "string" || typeof cookie.domain !== "string" || typeof cookie.path !== "string") {
      throw invalidStorageState("Every storage-state cookie must include string name, value, domain, and path fields.");
    }
  }
  return parsed as PlaywrightStorageState;
}

export function decodeStorageStateBase64(value: string): { state: PlaywrightStorageState; json: string } {
  const json = Buffer.from(value, "base64").toString("utf8");
  return { state: parseStorageState(json), json };
}

export async function readStorageState(statePath: string): Promise<{ state: PlaywrightStorageState; json: string }> {
  let json: string;
  try { json = await readFile(statePath, "utf8"); }
  catch (error) { throw new CliError("AUTH_STATE_NOT_FOUND", `Could not read Substack storage state at ${statePath}.`, 2, false, { cause: error instanceof Error ? error.message : String(error) }); }
  return { state: parseStorageState(json), json };
}

export async function writeStorageState(statePath: string, json: string): Promise<PlaywrightStorageState> {
  const state = parseStorageState(json);
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, json, { encoding: "utf8", mode: 0o600 });
  await chmod(statePath, 0o600);
  return state;
}

export function resolveStateEnvValue(stateEnv: unknown): string | undefined {
  const name = typeof stateEnv === "string" && stateEnv.length > 0 ? stateEnv : "NORIAGENT_SUBSTACK_STORAGE_B64";
  return process.env[name];
}

export async function resolveStorageState(globals: Record<string, unknown>): Promise<PlaywrightStorageState> {
  const explicitPath = typeof globals.state === "string" && globals.state.length > 0 ? globals.state : join(homedir(), ".local/share/noriagent/substack-storage-state.json");
  const encoded = resolveStateEnvValue(globals.stateEnv);
  if (encoded) {
    const decoded = decodeStorageStateBase64(encoded);
    if (explicitPath) await writeStorageState(explicitPath, decoded.json);
    return decoded.state;
  }
  return (await readStorageState(explicitPath)).state;
}

export function sessionCookies(state: PlaywrightStorageState): StorageStateCookie[] {
  return state.cookies.filter((cookie) => cookie.name === "connect.sid" || cookie.name === "substack.sid");
}

export function cookieHeader(state: PlaywrightStorageState): string {
  const cookies = sessionCookies(state);
  if (!cookies.length) throw new CliError("AUTH_REQUIRED", "Storage state does not contain a connect.sid or substack.sid session cookie.", 2, false);
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

export function redactSecrets(value: string, state: PlaywrightStorageState): string {
  let redacted = value;
  for (const cookie of state.cookies) if (cookie.value) redacted = redacted.split(cookie.value).join("[REDACTED]");
  return redacted;
}
