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

export async function getJson(input: string | URL, options: JsonGetOptions = {}): Promise<unknown> {
  const url = new URL(input);
  for (const [name, value] of options.query ?? []) {
    if (value !== undefined) url.searchParams.append(name, String(value));
  }
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", headers: { accept: "application/json", "user-agent": USER_AGENT } });
  } catch (error) {
    throw new CliError("NETWORK_ERROR", `Unable to reach Substack: ${error instanceof Error ? error.message : "network request failed"}`, 8, true);
  }
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
