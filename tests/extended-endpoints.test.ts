import { afterEach, describe, expect, test } from "vitest";
import { runCli, withHttpServer } from "./helpers.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()?.(); });

const state = Buffer.from(JSON.stringify({
  cookies: [{ name: "connect.sid", value: "s%3Aextended", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
  origins: [],
})).toString("base64");

interface Captured { method: string; url: URL; body: unknown }

async function invoke(args: string[]): Promise<Captured> {
  let captured: Captured | undefined;
  let count = 0;
  const server = await withHttpServer((request, response) => {
    count += 1;
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      captured = { method: request.method ?? "", url: new URL(request.url ?? "", "http://local"), body: raw ? JSON.parse(raw) : undefined };
      response.setHeader("content-type", "application/json");
      response.end("{\"ok\":true}");
    });
  });
  closers.push(server.close);
  const expanded = args.map((arg) => arg === "$ORIGIN" ? server.origin : arg);
  const result = await runCli(["--account-origin", server.origin, "--state-env", "EXTENDED_STATE", ...expanded], { EXTENDED_STATE: state });
  expect(result.code, result.stderr).toBe(0);
  expect(count).toBe(1);
  if (!captured) throw new Error("Expected one HTTP request");
  return captured;
}

async function expectPath(args: string[], pathname: string, method = "GET"): Promise<Captured> {
  const captured = await invoke(args);
  expect(captured.method).toBe(method);
  expect(captured.url.pathname).toBe(pathname);
  return captured;
}

describe("extended verified endpoint coverage", () => {
  test("reads public profiles and publication administration resources", async () => {
    await expectPath(["profile", "get", "--user-id", "12", "--handle", "alice"], "/api/v1/user/12-alice/public_profile/self");
    await expectPath(["publication", "sections", "--publication-url", "$ORIGIN"], "/api/v1/publication/sections");
    await expectPath(["publication", "pages", "--publication-url", "$ORIGIN"], "/api/v1/publication_pages");
    await expectPath(["publication", "users", "--publication-url", "$ORIGIN"], "/api/v1/publication/users");
    await expectPath(["publication", "tags", "--publication-url", "$ORIGIN"], "/api/v1/publication/post-tag");
    await expectPath(["publication", "export", "--publication-url", "$ORIGIN"], "/api/v1/publication_export");
    const search = await expectPath(["publication", "search", "--query", "climate"], "/api/v1/publication/search");
    expect(Object.fromEntries(search.url.searchParams)).toEqual({ query: "climate", page: "0" });
  });

  test("creates, updates, and inspects post drafts", async () => {
    const create = await expectPath(["post", "create", "--publication-url", "$ORIGIN", "--data", "{\"draft_title\":\"A\"}", "--confirm"], "/api/v1/drafts", "POST");
    expect(create.body).toEqual({ draft_title: "A" });
    const update = await expectPath(["post", "update", "--publication-url", "$ORIGIN", "--draft-id", "44", "--data", "{\"draft_title\":\"B\"}", "--confirm"], "/api/v1/drafts/44", "PUT");
    expect(update.body).toEqual({ draft_title: "B" });
    const stats = await expectPath(["post", "stats", "--publication-url", "$ORIGIN", "--post-id", "7", "--limit", "1"], "/api/v1/post_management/detail/7");
    expect(Object.fromEntries(stats.url.searchParams)).toEqual({ offset: "0", limit: "1" });
  });

  test("reads and mutates Notes", async () => {
    const feed = await expectPath(["note", "feed", "--limit", "8"], "/api/v1/reader/feed");
    expect(feed.url.searchParams.get("limit")).toBe("8");
    await expectPath(["note", "profile", "--user-id", "12", "--limit", "5"], "/api/v1/reader/feed/profile/12");
    await expectPath(["note", "get", "--entity-key", "c-9"], "/api/v1/reader/feed/c-9");
    await expectPath(["note", "drafts", "--publication-url", "$ORIGIN", "--limit", "3"], "/api/v1/feed/drafts");
    const reply = await expectPath(["note", "reply", "--comment-id", "9", "--text", "Thanks", "--confirm"], "/api/v1/comment/9/reply", "POST");
    expect(reply.body).toMatchObject({ bodyJson: { type: "doc" } });
    await expectPath(["note", "delete", "--comment-id", "9", "--confirm"], "/api/v1/comment/9", "DELETE");
    await expectPath(["note", "mark-seen", "--entity-key", "c-9", "--confirm"], "/api/v1/reader/feed/c-9/seen", "POST");
  });

  test("creates, deletes, and reacts to comments", async () => {
    const created = await expectPath(["comment", "create", "--publication-url", "$ORIGIN", "--post-id", "7", "--text", "Nice", "--confirm"], "/api/v1/post/7/comment", "POST");
    expect(created.body).toEqual({ body: "Nice" });
    await expectPath(["comment", "delete", "--comment-id", "8", "--confirm"], "/api/v1/comment/8", "DELETE");
    const reacted = await expectPath(["comment", "react", "--publication-url", "$ORIGIN", "--post-id", "7", "--reaction", "❤", "--confirm"], "/api/v1/post/7/reaction", "POST");
    expect(reacted.body).toEqual({ reaction: "❤", surface: "reader" });
    await expectPath(["comment", "unreact", "--publication-url", "$ORIGIN", "--post-id", "7", "--confirm"], "/api/v1/post/7/reaction", "DELETE");
    await expectPath(["comment", "moderation"], "/api/v1/comment/moderation/delete_reasons");
  });

  test("covers reader feeds, subscriptions, messages, and counters", async () => {
    const feed = await expectPath(["reader", "feed", "--limit", "4", "--cursor", "next"], "/api/v1/reader/feed");
    expect(Object.fromEntries(feed.url.searchParams)).toEqual({ limit: "4", cursor: "next" });
    await expectPath(["reader", "tabs"], "/api/v1/reader/feed/tabs");
    await expectPath(["reader", "subscriptions"], "/api/v1/subscriptions/page_v2");
    await expectPath(["reader", "archive", "--publication-url", "$ORIGIN"], "/api/v1/archive");
    await expectPath(["reader", "activity"], "/api/v1/activity/unread");
    await expectPath(["reader", "messages"], "/api/v1/messages/inbox");
    await expectPath(["reader", "unread-counts"], "/api/v1/messages/unread-count");
    await expectPath(["reader", "blocked-users"], "/api/v1/blocks/ids");
  });

  test("adds/removes subscribers and reads import state", async () => {
    const added = await expectPath(["subscriber", "add", "--publication-url", "$ORIGIN", "--email", "reader@example.com", "--name", "Reader", "--confirm"], "/api/v1/subscriber/add", "POST");
    expect(added.body).toEqual({ email: "reader@example.com", name: "Reader" });
    await expectPath(["subscriber", "remove", "--publication-url", "$ORIGIN", "--subscription-id", "99", "--confirm"], "/api/v1/subscriber/99", "DELETE");
    await expectPath(["subscriber", "import-status", "--publication-url", "$ORIGIN"], "/api/v1/import");
  });

  test("covers recommendation discovery, removal, relationship, and stats", async () => {
    await expectPath(["recommendation", "list", "--publication-url", "$ORIGIN", "--publication-id", "4"], "/api/v1/recommendations/from/4");
    const search = await expectPath(["recommendation", "search", "--query", "science"], "/api/v1/publication/search");
    expect(Object.fromEntries(search.url.searchParams)).toEqual({ query: "science", page: "0" });
    await expectPath(["recommendation", "suggested", "--publication-url", "$ORIGIN", "--publication-id", "4"], "/api/v1/recommendations/4/suggested");
    const removed = await expectPath(["recommendation", "remove", "--publication-url", "$ORIGIN", "--from-publication-id", "4", "--publication-id", "8", "--confirm"], "/api/v1/recommendations/", "DELETE");
    expect(removed.body).toMatchObject({ recommending_publication_id: 4, recommended_publication_id: 8 });
    await expectPath(["recommendation", "relationship", "--publication-url", "$ORIGIN", "--from-publication-id", "4", "--publication-id", "8"], "/api/v1/recommendations/from/4/to/8");
    const stats = await expectPath(["recommendation", "stats", "--publication-url", "$ORIGIN", "--limit", "20"], "/api/v1/recommendations/stats/to");
    expect(stats.url.searchParams.get("order_by")).toBe("xp_signups");
  });

  test("covers analytics, live hosts, and YouTube status", async () => {
    await expectPath(["analytics", "post", "--publication-url", "$ORIGIN", "--post-id", "7"], "/api/v1/post_management/detail/7");
    await expectPath(["analytics", "email", "--publication-url", "$ORIGIN"], "/api/v1/publication/stats/emails/timeseries");
    await expectPath(["analytics", "network", "--publication-url", "$ORIGIN"], "/api/v1/publication/stats/network_attribution");
    await expectPath(["analytics", "pledges", "--publication-url", "$ORIGIN"], "/api/v1/publication/stats/payment_pledges");
    await expectPath(["analytics", "timeseries", "--publication-url", "$ORIGIN", "--range", "365"], "/api/v1/publish-dashboard/summary-v2");
    await expectPath(["live", "eligible-hosts", "--publication-url", "$ORIGIN"], "/api/v1/live_stream/eligible_hosts");
    await expectPath(["crosspost", "youtube", "--publication-url", "$ORIGIN"], "/api/v1/video/youtube/check-authorization");
  });

  test("covers chat settings, schedules, sends, and deletes", async () => {
    const settings = await expectPath(["chat", "settings", "--publication-url", "$ORIGIN", "--publication-id", "3", "--data", "{\"threads_v2_enabled\":true}", "--confirm"], "/api/v1/publication/3/publication_threads_settings", "POST");
    expect(settings.body).toEqual({ threads_v2_enabled: true });
    await expectPath(["chat", "scheduled", "--publication-url", "$ORIGIN", "--publication-id", "3"], "/api/v1/community/publications/3/posts/scheduled");
    const sent = await expectPath(["chat", "send", "--publication-url", "$ORIGIN", "--publication-id", "3", "--data", "{\"id\":\"thread-1\",\"body\":\"Hello\"}", "--confirm"], "/api/v1/community/publications/3/posts", "POST");
    expect(sent.body).toMatchObject({ id: "thread-1", body: "Hello" });
    await expectPath(["chat", "delete", "--publication-url", "$ORIGIN", "--thread-id", "thread-1", "--confirm"], "/api/v1/community/posts/thread-1", "DELETE");
  });
});
