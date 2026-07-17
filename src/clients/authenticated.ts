import { CliError } from "../core/errors.js";
import { cookieHeader, redactSecrets, resolveStorageState } from "../core/auth.js";

export interface AuthenticatedRequest { url: string; method?: string; body?: unknown; globals: Record<string, unknown> }

export async function authenticatedRequest<T = unknown>(request: AuthenticatedRequest): Promise<T> {
  const state = await resolveStorageState(request.globals);
  const cookie = cookieHeader(state);
  const method = request.method ?? "GET";
  let response: Response;
  try {
    response = await fetch(request.url, {
      method,
      headers: { accept: "application/json", cookie, ...(request.body === undefined ? {} : { "content-type": "application/json" }) },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
  } catch (error) {
    throw new CliError("NETWORK_ERROR", "The authenticated Substack request failed before receiving a response.", 1, method === "GET", { method, url: request.url, cause: redactSecrets(error instanceof Error ? error.message : String(error), state) });
  }
  const text = await response.text();
  let data: unknown;
  if (text) { try { data = JSON.parse(text); } catch { data = redactSecrets(text, state); } }
  if (!response.ok) throw new CliError("SUBSTACK_HTTP_ERROR", `Substack returned HTTP ${response.status}.`, 1, method === "GET", { method, url: request.url, status: response.status, response: redactSecrets(text, state) });
  return data as T;
}

export function joinSubstackUrl(origin: string, urlPath: string): string {
  return new URL(urlPath.replace(/^\/+/, ""), origin.endsWith("/") ? origin : `${origin}/`).toString();
}
