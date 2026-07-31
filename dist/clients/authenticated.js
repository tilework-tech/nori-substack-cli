import { CliError } from "../core/errors.js";
import { cookieHeader, redactSecrets, resolveStorageState } from "../core/auth.js";
export async function authenticatedRequest(request) {
    const state = await resolveStorageState(request.globals);
    const cookie = cookieHeader(state);
    const method = request.method ?? "GET";
    const { origin } = new URL(request.url);
    let response;
    try {
        response = await fetch(request.url, {
            method,
            headers: { accept: "application/json", cookie, origin, referer: `${origin}/publish/home`, ...(request.body === undefined ? {} : { "content-type": "application/json" }) },
            ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        });
    }
    catch (error) {
        throw new CliError("NETWORK_ERROR", "The authenticated Substack request failed before receiving a response.", 1, method === "GET", { method, url: request.url, cause: redactSecrets(error instanceof Error ? error.message : String(error), state) });
    }
    const text = await response.text();
    let data;
    if (text) {
        try {
            data = JSON.parse(text);
        }
        catch {
            data = redactSecrets(text, state);
        }
    }
    if (!response.ok)
        throw new CliError("SUBSTACK_HTTP_ERROR", `Substack returned HTTP ${response.status}.`, 1, method === "GET", { method, url: request.url, status: response.status, response: redactSecrets(text, state) });
    return data;
}
export function joinSubstackUrl(origin, urlPath) {
    return new URL(urlPath.replace(/^\/+/, ""), origin.endsWith("/") ? origin : `${origin}/`).toString();
}
//# sourceMappingURL=authenticated.js.map