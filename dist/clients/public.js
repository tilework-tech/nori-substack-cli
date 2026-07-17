import { load } from "cheerio";
import { CliError } from "../core/errors.js";
import { getJson } from "../core/http.js";
function requireUrl(value, optionName) {
    if (typeof value !== "string" || !value.trim())
        throw new CliError("INVALID_ARGUMENT", `${optionName} is required.`, 2, false, { option: optionName });
    try {
        const url = new URL(value);
        if (!/^https?:$/.test(url.protocol))
            throw new Error();
        return url.toString();
    }
    catch {
        throw new CliError("INVALID_ARGUMENT", `${optionName} must be a valid HTTP or HTTPS URL.`, 2, false, { option: optionName });
    }
}
function endpoint(baseUrl, pathname) { const url = new URL(requireUrl(baseUrl, "publication URL")); url.pathname = pathname; url.search = ""; url.hash = ""; return url; }
async function fetchText(url) {
    let response;
    try {
        response = await fetch(url, { headers: { "user-agent": "nori-substack-cli/0.1", accept: "application/rss+xml, application/xml, text/xml" } });
    }
    catch (error) {
        throw new CliError("NETWORK_ERROR", `Unable to reach Substack: ${error instanceof Error ? error.message : String(error)}`, 8, true);
    }
    if (!response.ok)
        throw new CliError("HTTP_ERROR", `Substack request failed with HTTP ${response.status}.`, 8, response.status >= 500, { status: response.status });
    return response.text();
}
async function publicationFromHomepage(publicationUrl) {
    const url = endpoint(publicationUrl, "/");
    let response;
    try {
        response = await fetch(url, { headers: { "user-agent": "nori-substack-cli/0.1", accept: "text/html" } });
    }
    catch (error) {
        throw new CliError("NETWORK_ERROR", `Unable to reach Substack: ${error instanceof Error ? error.message : String(error)}`, 8, true);
    }
    if (!response.ok)
        throw new CliError("HTTP_ERROR", `Substack homepage request failed with HTTP ${response.status}.`, 8, response.status >= 500, { status: response.status });
    const html = await response.text();
    const $ = load(html);
    for (const script of $("script").toArray()) {
        const source = $(script).text();
        const match = source.match(/window\._preloads\s*=\s*JSON\.parse\(("(?:\\.|[^"\\])*")\)/s);
        if (!match)
            continue;
        try {
            const serialized = JSON.parse(match[1]);
            const preloads = JSON.parse(serialized);
            if (preloads.pub && typeof preloads.pub === "object")
                return preloads.pub;
        }
        catch {
            break;
        }
    }
    throw new CliError("INVALID_RESPONSE", "Substack homepage did not contain publication preload metadata.", 8, false);
}
async function fetchOfficial(url, token) {
    let response;
    try {
        response = await fetch(url, { headers: { accept: "application/json", "user-agent": "nori-substack-cli/0.1", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    }
    catch (error) {
        throw new CliError("NETWORK_ERROR", `Unable to reach Substack: ${error instanceof Error ? error.message : String(error)}`, 8, true);
    }
    const text = await response.text();
    if (!response.ok)
        throw new CliError("HTTP_ERROR", `Substack request failed with HTTP ${response.status}.`, 8, response.status >= 500, { status: response.status });
    try {
        return JSON.parse(text);
    }
    catch {
        throw new CliError("INVALID_RESPONSE", "Substack returned invalid JSON.", 8);
    }
}
export class PublicClient {
    async getPublication(publicationUrl) {
        try {
            return await getJson(endpoint(publicationUrl, "/api/v1/publication"));
        }
        catch (error) {
            if (error instanceof CliError && error.code === "HTTP_ERROR" && error.details.status === 403)
                return publicationFromHomepage(publicationUrl);
            throw error;
        }
    }
    async getArchive(publicationUrl) { return getJson(endpoint(publicationUrl, "/api/v1/archive")); }
    async listPosts(publicationUrl, options = {}) { return getJson(endpoint(publicationUrl, "/api/v1/posts"), { query: [["limit", options.limit], ["offset", options.offset]] }); }
    async getPost(publicationUrl, postId) { return getJson(endpoint(publicationUrl, `/api/v1/posts/by-id/${encodeURIComponent(postId)}`)); }
    async getPostBySlug(publicationUrl, slug) { return getJson(endpoint(publicationUrl, `/api/v1/posts/${encodeURIComponent(slug)}`)); }
    async getProfileNotes(accountOrigin, userId, cursor) { return getJson(endpoint(accountOrigin, `/api/v1/reader/feed/profile/${encodeURIComponent(userId)}`), { query: [["types", "note"], ["limit", 20], ["cursor", cursor]] }); }
    async listComments(publicationUrl, postId, limit) { return getJson(endpoint(publicationUrl, `/api/v1/post/${encodeURIComponent(postId)}/comments`), { query: [["all_comments", "true"], ["limit", limit ?? 20]] }); }
    async getProfile(accountOrigin, userId, handle) { return getJson(endpoint(accountOrigin, `/api/v1/user/${encodeURIComponent(userId)}-${encodeURIComponent(handle.replace(/^@/, ""))}/public_profile/self`)); }
    async categories(accountOrigin) { return getJson(endpoint(accountOrigin, "/api/v1/categories")); }
    async search(accountOrigin, query) { return getJson(endpoint(accountOrigin, "/api/v1/search/explore/web"), { query: [["query", query]] }); }
    async lookupLinkedin(accountOrigin, handle, developerToken) { return fetchOfficial(endpoint(accountOrigin, `/profile/search/linkedin/${encodeURIComponent(handle.replace(/^@/, ""))}`), developerToken); }
    async getFeed(publicationUrl) {
        const xml = await fetchText(endpoint(publicationUrl, "/feed"));
        const $ = load(xml, { xmlMode: true });
        const channel = $("channel").first();
        const items = channel.find("item").toArray().map((item) => {
            const node = $(item);
            const published = node.find("pubDate").first().text().trim();
            const content = node.find("content\\:encoded").first().text();
            return { id: node.find("guid").first().text().trim() || node.find("link").first().text().trim(), title: node.find("title").first().text().trim(), url: node.find("link").first().text().trim(), ...(published ? { published } : {}), description: node.find("description").first().text(), ...(content ? { content } : {}) };
        });
        return { title: channel.children("title").first().text().trim(), url: channel.children("link").first().text().trim(), description: channel.children("description").first().text(), items };
    }
}
//# sourceMappingURL=public.js.map