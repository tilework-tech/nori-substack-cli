import { CliError } from "../core/errors.js";
import { describeDryRun, requireConfirmation } from "../core/safety.js";
import { authenticatedRequest, joinSubstackUrl } from "../clients/authenticated.js";
import { textToProseMirror } from "../domain/prosemirror.js";
import { executeMediaCommand } from "./execute-media.js";

type Options = Record<string, unknown>;
type Globals = Record<string, unknown>;
type Result = { data: unknown; dryRun?: boolean };
type QueryValue = string | number | boolean | undefined;

function optionName(name: string): string { return `--${name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}`; }
function str(options: Options, name: string, fallback?: string): string {
  const value = options[name] ?? fallback;
  if (typeof value !== "string" || !value) throw new CliError("INVALID_ARGUMENT", `${optionName(name)} is required.`, 2);
  return value;
}
function optionalStr(options: Options, name: string): string | undefined { const value = options[name]; return typeof value === "string" && value ? value : undefined; }
function num(options: Options, name: string, fallback: number): number {
  const value = Number(options[name] ?? fallback);
  if (!Number.isFinite(value)) throw new CliError("INVALID_ARGUMENT", `${optionName(name)} must be numeric.`, 2);
  return value;
}
function segment(options: Options, name: string): string { return encodeURIComponent(str(options, name)); }
function account(globals: Globals): string { return typeof globals.accountOrigin === "string" ? globals.accountOrigin : "https://substack.com"; }
function publication(options: Options): string { return str(options, "publicationUrl"); }
function scopedOrigin(options: Options, globals: Globals): string { return optionalStr(options, "publicationUrl") ?? account(globals); }
function queryUrl(origin: string, path: string, entries: Array<[string, QueryValue]>): string {
  const url = new URL(joinSubstackUrl(origin, path));
  for (const [key, value] of entries) if (value !== undefined) url.searchParams.append(key, String(value));
  return url.toString();
}
async function request(origin: string, path: string, globals: Globals, method = "GET", body?: unknown): Promise<Result> {
  return { data: await authenticatedRequest({ url: joinSubstackUrl(origin, path), method, body, globals }) };
}
async function queryRequest(origin: string, path: string, globals: Globals, entries: Array<[string, QueryValue]>): Promise<Result> {
  return { data: await authenticatedRequest({ url: queryUrl(origin, path, entries), globals }) };
}
function parseData(options: Options): unknown {
  const raw = str(options, "data");
  try { return JSON.parse(raw); } catch { throw new CliError("INVALID_JSON", "--data must be valid JSON.", 2); }
}
async function mutate(origin: string, path: string, globals: Globals, options: Options, method: string, body: unknown, impact: string): Promise<Result> {
  const url = joinSubstackUrl(origin, path);
  if (options.dryRun === true) return describeDryRun({ method, url, body, impact });
  requireConfirmation(options.confirm, impact);
  return { data: await authenticatedRequest({ url, method, body, globals }) };
}

async function executeProfile(operation: string, options: Options, globals: Globals): Promise<Result> {
  if (operation === "get") return request(account(globals), `/api/v1/user/${segment(options, "userId")}-${segment(options, "handle")}/public_profile/self`, globals);
  throw unsupported("profile", operation);
}

async function executePublication(operation: string, options: Options, globals: Globals): Promise<Result> {
  if (operation === "owned") return request(account(globals), "/api/v1/user/profile/self", globals);
  if (operation === "search") return queryRequest(account(globals), "/api/v1/publication/search", globals, [["query", str(options, "query")], ["page", num(options, "page", 0)]]);
  if (operation === "settings") return request(publication(options), "/api/v1/publication_settings", globals);
  if (operation === "update") return mutate(publication(options), "/api/v1/publication", globals, options, "PUT", parseData(options), "Updates publication metadata.");
  const readPaths: Record<string, string> = {
    sections: "/api/v1/publication/sections",
    pages: "/api/v1/publication_pages",
    users: "/api/v1/publication/users",
    tags: "/api/v1/publication/post-tag",
    export: "/api/v1/publication_export",
  };
  if (readPaths[operation]) return request(publication(options), readPaths[operation], globals);
  throw unsupported("publication", operation);
}

async function executePost(operation: string, options: Options, globals: Globals): Promise<Result> {
  if (operation === "drafts") return queryRequest(publication(options), "/api/v1/post_management/drafts", globals, [["offset", num(options, "offset", 0)], ["limit", num(options, "limit", 20)], ["order_by", "draft_updated_at"], ["order_direction", "desc"]]);
  if (operation === "create") return mutate(publication(options), "/api/v1/drafts", globals, options, "POST", parseData(options), "Creates a publication draft.");
  if (operation === "update") return mutate(publication(options), `/api/v1/drafts/${segment(options, "draftId")}`, globals, options, "PUT", parseData(options), `Updates draft ${str(options, "draftId")}.`);
  if (operation === "schedule") return mutate(publication(options), `/api/v1/drafts/${segment(options, "draftId")}/scheduled_release`, globals, options, "POST", { trigger_at: str(options, "at"), post_audience: str(options, "audience", "everyone") }, `Schedules draft ${str(options, "draftId")}.`);
  if (operation === "stats") return queryRequest(publication(options), `/api/v1/post_management/detail/${segment(options, "postId")}`, globals, [["offset", num(options, "offset", 0)], ["limit", num(options, "limit", 1)]]);
  throw unsupported("post", operation);
}

async function executeNote(operation: string, options: Options, globals: Globals): Promise<Result> {
  if (operation === "feed") return queryRequest(account(globals), "/api/v1/reader/feed", globals, [["limit", num(options, "limit", 20)], ["cursor", optionalStr(options, "cursor")]]);
  if (operation === "profile") return queryRequest(account(globals), `/api/v1/reader/feed/profile/${segment(options, "userId")}`, globals, [["limit", num(options, "limit", 20)]]);
  if (operation === "get") return request(account(globals), `/api/v1/reader/feed/${segment(options, "entityKey")}`, globals);
  if (operation === "drafts") return queryRequest(publication(options), "/api/v1/feed/drafts", globals, [["limit", num(options, "limit", 20)]]);
  if (operation === "create") return mutate(account(globals), "/api/v1/comment/feed", globals, options, "POST", { bodyJson: textToProseMirror(str(options, "text")), replyMinimumRole: str(options, "replyMinimumRole", "everyone") }, "Publishes a Note.");
  if (operation === "reply") return mutate(account(globals), `/api/v1/comment/${segment(options, "commentId")}/reply`, globals, options, "POST", { bodyJson: textToProseMirror(str(options, "text")) }, `Replies to Note ${str(options, "commentId")}.`);
  if (operation === "delete") return mutate(account(globals), `/api/v1/comment/${segment(options, "commentId")}`, globals, options, "DELETE", undefined, `Deletes Note ${str(options, "commentId")}.`);
  if (operation === "mark-seen") return mutate(account(globals), `/api/v1/reader/feed/${segment(options, "entityKey")}/seen`, globals, options, "POST", undefined, `Marks ${str(options, "entityKey")} as seen.`);
  throw unsupported("note", operation);
}

async function executeComment(operation: string, options: Options, globals: Globals): Promise<Result> {
  if (operation === "list") return queryRequest(publication(options), `/api/v1/post/${segment(options, "postId")}/comments`, globals, [["all_comments", true], ["limit", num(options, "limit", 20)]]);
  if (operation === "create") return mutate(publication(options), `/api/v1/post/${segment(options, "postId")}/comment`, globals, options, "POST", { body: str(options, "text") }, `Creates a comment on post ${str(options, "postId")}.`);
  if (operation === "delete") return mutate(account(globals), `/api/v1/comment/${segment(options, "commentId")}`, globals, options, "DELETE", undefined, `Deletes comment ${str(options, "commentId")}.`);
  if (operation === "react") return mutate(publication(options), `/api/v1/post/${segment(options, "postId")}/reaction`, globals, options, "POST", { reaction: str(options, "reaction", "❤"), surface: "reader" }, `Reacts to post ${str(options, "postId")}.`);
  if (operation === "unreact") return mutate(publication(options), `/api/v1/post/${segment(options, "postId")}/reaction`, globals, options, "DELETE", undefined, `Removes the reaction from post ${str(options, "postId")}.`);
  if (operation === "moderation") return request(account(globals), "/api/v1/comment/moderation/delete_reasons", globals);
  throw unsupported("comment", operation);
}

async function executeReader(operation: string, options: Options, globals: Globals): Promise<Result> {
  if (operation === "inbox") return queryRequest(account(globals), "/api/v1/inbox/top", globals, [["inboxType", "inbox"], ["surface", "inbox_all"], ["limit", num(options, "limit", 20)]]);
  if (operation === "feed") return queryRequest(account(globals), "/api/v1/reader/feed", globals, [["limit", num(options, "limit", 20)], ["cursor", optionalStr(options, "cursor")]]);
  if (operation === "subscriptions") return queryRequest(account(globals), "/api/v1/subscriptions/page_v2", globals, [["limit", options.limit === undefined ? undefined : num(options, "limit", 20)], ["offset", options.offset === undefined ? undefined : num(options, "offset", 0)]]);
  if (operation === "archive") return request(publication(options), "/api/v1/archive", globals);
  const paths: Record<string, string> = {
    tabs: "/api/v1/reader/feed/tabs",
    activity: "/api/v1/activity/unread",
    messages: "/api/v1/messages/inbox",
    "unread-counts": "/api/v1/messages/unread-count",
    "blocked-users": "/api/v1/blocks/ids",
  };
  if (paths[operation]) return request(account(globals), paths[operation], globals);
  throw unsupported("reader", operation);
}

async function executeSubscriber(operation: string, options: Options, globals: Globals): Promise<Result> {
  if (operation === "list") return request(publication(options), "/api/v1/subscriber-stats", globals, "POST", { filters: { order_by_desc_nulls_last: "subscription_created_at" }, limit: num(options, "limit", 50), offset: num(options, "offset", 0) });
  if (operation === "add") return mutate(publication(options), "/api/v1/subscriber/add", globals, options, "POST", { email: str(options, "email"), ...(optionalStr(options, "name") ? { name: optionalStr(options, "name") } : {}) }, `Adds subscriber ${str(options, "email")}.`);
  if (operation === "remove") return mutate(publication(options), `/api/v1/subscriber/${segment(options, "subscriptionId")}`, globals, options, "DELETE", undefined, `Removes subscription ${str(options, "subscriptionId")}.`);
  if (operation === "import-status") return request(publication(options), "/api/v1/import", globals);
  throw unsupported("subscriber", operation);
}

async function executeRecommendation(operation: string, options: Options, globals: Globals): Promise<Result> {
  if (operation === "list") return queryRequest(publication(options), `/api/v1/recommendations/from/${segment(options, "publicationId")}`, globals, [["offset", options.offset === undefined ? undefined : num(options, "offset", 0)], ["limit", options.limit === undefined ? undefined : num(options, "limit", 50)], ["paginate", options.limit === undefined && options.offset === undefined ? undefined : true]]);
  if (operation === "search") return queryRequest(account(globals), "/api/v1/publication/search", globals, [["query", str(options, "query")], ["page", num(options, "page", 0)]]);
  if (operation === "suggested") return request(publication(options), `/api/v1/recommendations/${segment(options, "publicationId")}/suggested`, globals);
  if (operation === "add" || operation === "remove") {
    const edge = { recommended_publication_id: num(options, "publicationId", Number.NaN), recommending_publication_id: num(options, "fromPublicationId", Number.NaN), source: str(options, "source", "manual-search") };
    if (operation === "add") return mutate(publication(options), "/api/v1/recommendations", globals, options, "PUT", { ...edge, suggested: options.suggested === true }, `Adds recommendation from ${edge.recommending_publication_id} to ${edge.recommended_publication_id}.`);
    return mutate(publication(options), "/api/v1/recommendations/", globals, options, "DELETE", edge, `Removes recommendation from ${edge.recommending_publication_id} to ${edge.recommended_publication_id}.`);
  }
  if (operation === "relationship") return request(publication(options), `/api/v1/recommendations/from/${segment(options, "fromPublicationId")}/to/${segment(options, "publicationId")}`, globals);
  if (operation === "stats") return queryRequest(publication(options), "/api/v1/recommendations/stats/to", globals, [["offset", num(options, "offset", 0)], ["limit", num(options, "limit", 50)], ["order_by", "xp_signups"], ["order_direction", "desc"]]);
  throw unsupported("recommendation", operation);
}

async function executeAnalytics(operation: string, options: Options, globals: Globals): Promise<Result> {
  if (operation === "summary" || operation === "timeseries") return queryRequest(publication(options), "/api/v1/publish-dashboard/summary-v2", globals, [["range", num(options, "range", 30)]]);
  if (operation === "post") return queryRequest(publication(options), `/api/v1/post_management/detail/${segment(options, "postId")}`, globals, [["offset", num(options, "offset", 0)], ["limit", num(options, "limit", 1)]]);
  if (operation === "growth") return queryRequest(publication(options), "/api/v1/publication/stats/growth/sources", globals, [["from_date", str(options, "from")], ["to_date", str(options, "to")], ["order_by", "users"], ["order_direction", "desc"]]);
  const paths: Record<string, string> = { email: "/api/v1/publication/stats/emails/timeseries", network: "/api/v1/publication/stats/network_attribution", pledges: "/api/v1/publication/stats/payment_pledges" };
  if (paths[operation]) return request(publication(options), paths[operation], globals);
  throw unsupported("analytics", operation);
}

async function executeChat(operation: string, options: Options, globals: Globals): Promise<Result> {
  const origin = scopedOrigin(options, globals);
  if (operation === "list") return request(origin, `/api/v1/community/publications/${segment(options, "publicationId")}/posts`, globals);
  if (operation === "scheduled") return request(origin, `/api/v1/community/publications/${segment(options, "publicationId")}/posts/scheduled`, globals);
  if (operation === "settings") return mutate(origin, `/api/v1/publication/${segment(options, "publicationId")}/publication_threads_settings`, globals, options, "POST", parseData(options), "Updates publication chat settings.");
  if (operation === "send") return mutate(origin, `/api/v1/community/publications/${segment(options, "publicationId")}/posts`, globals, options, "POST", parseData(options), "Sends a publication chat post.");
  if (operation === "delete") return mutate(origin, `/api/v1/community/posts/${segment(options, "threadId")}`, globals, options, "DELETE", undefined, `Deletes chat thread ${str(options, "threadId")}.`);
  throw unsupported("chat", operation);
}

function unsupported(family: string, operation: string): CliError {
  return new CliError("UNSUPPORTED_OPERATION", `The command "${family} ${operation}" is not supported yet.`, 3, false, { family, operation });
}

export async function executeVerifiedCommand(family: string, operation: string, options: Options, globals: Globals): Promise<Result> {
  if (family === "profile") return executeProfile(operation, options, globals);
  if (family === "publication") return executePublication(operation, options, globals);
  if (family === "post") return executePost(operation, options, globals);
  if (family === "note") return executeNote(operation, options, globals);
  if (family === "comment") return executeComment(operation, options, globals);
  if (family === "reader") return executeReader(operation, options, globals);
  if (family === "subscriber") return executeSubscriber(operation, options, globals);
  if (family === "recommendation") return executeRecommendation(operation, options, globals);
  if (family === "analytics") return executeAnalytics(operation, options, globals);
  if (family === "chat") return executeChat(operation, options, globals);
  if (family === "media" && operation !== "audio-status") return executeMediaCommand(operation, options, globals);
  if (family === "media" && operation === "audio-status") return request(publication(options), `/api/v1/audio/upload/${segment(options, "uploadId")}`, globals);
  if (family === "live" && operation === "streams") return request(publication(options), "/api/v1/live_streams", globals);
  if (family === "live" && operation === "eligible-hosts") return request(publication(options), "/api/v1/live_stream/eligible_hosts", globals);
  if (family === "crosspost" && operation === "linkedin") return request(publication(options), "/api/v1/video/linkedin/check-authorization", globals);
  if (family === "crosspost" && operation === "youtube") return request(publication(options), "/api/v1/video/youtube/check-authorization", globals);
  throw unsupported(family, operation);
}
