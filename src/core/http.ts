import { CliError } from "./errors.js";

const USER_AGENT = "nori-substack-cli/0.1 (+https://github.com/tilework-tech/nori-substack-cli)";

export interface JsonGetOptions {
  query?: ReadonlyArray<readonly [string, string | number | undefined]>;
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) return undefined;
  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const body = await response.text();
  if (body.length === 0) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new CliError("INVALID_RESPONSE", `Substack returned a non-JSON response (HTTP ${response.status}).`, 8, false, {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "unknown",
    });
  }
}

const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 5_000;

function envInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

// Substack's Cloudflare edge challenges some datacenter IPs outright: every request gets a 403 with
// `cf-mitigated: challenge`, regardless of endpoint or credentials. It is per-IP and usually short-lived.
export function isCloudflareChallenge(response: Response): boolean {
  return response.status === 403 && response.headers.get("cf-mitigated")?.toLowerCase() === "challenge";
}

function transient(response: Response): boolean {
  return response.status >= 500 || isCloudflareChallenge(response);
}

// Public GETs are idempotent, so network errors, 5xx responses, and Cloudflare challenges are retried with
// exponential backoff. Override with NORI_SUBSTACK_HTTP_RETRIES and NORI_SUBSTACK_HTTP_RETRY_DELAY_MS.
export async function publicGet(url: string | URL, headers: Record<string, string>): Promise<Response> {
  const retries = envInteger("NORI_SUBSTACK_HTTP_RETRIES", DEFAULT_RETRIES);
  const baseDelay = envInteger("NORI_SUBSTACK_HTTP_RETRY_DELAY_MS", DEFAULT_RETRY_DELAY_MS);
  for (let attempt = 0; ; attempt += 1) {
    let response: Response | undefined;
    let failure: unknown;
    try { response = await fetch(url, { method: "GET", headers }); }
    catch (error) { failure = error; }
    if (response && !transient(response)) return response;
    if (attempt >= retries) {
      if (response && isCloudflareChallenge(response)) {
        throw new CliError("CLOUDFLARE_CHALLENGE", `Substack's Cloudflare edge challenged this machine's IP (HTTP 403, cf-mitigated: challenge) on ${attempt + 1} attempts. This is an IP-level block, not an auth or endpoint problem; retry later or from another machine.`, 8, true, { status: 403, cfMitigated: "challenge", attempts: attempt + 1 });
      }
      if (response) return response;
      throw new CliError("NETWORK_ERROR", `Unable to reach Substack: ${failure instanceof Error ? failure.message : "network request failed"}`, 8, true, { attempts: attempt + 1 });
    }
    await response?.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, baseDelay * 2 ** attempt));
  }
}

export async function getJson(input: string | URL, options: JsonGetOptions = {}): Promise<unknown> {
  const url = new URL(input);
  for (const [name, value] of options.query ?? []) {
    if (value !== undefined) url.searchParams.append(name, String(value));
  }
  const response = await publicGet(url, { accept: "application/json", "user-agent": USER_AGENT });
  if (response.status === 429) {
    const seconds = retryAfterSeconds(response.headers.get("retry-after"));
    const details: Record<string, unknown> = { status: response.status };
    if (seconds !== undefined) details.retryAfterSeconds = seconds;
    throw new CliError("RATE_LIMITED", "Substack rate limited the request.", 9, true, details);
  }
  if (!response.ok) {
    throw new CliError("HTTP_ERROR", `Substack request failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`, 8, response.status >= 500, { status: response.status });
  }
  return parseJsonResponse(response);
}
