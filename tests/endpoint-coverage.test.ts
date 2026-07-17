import { afterEach, describe, expect, test } from "vitest";
import type { IncomingMessage } from "node:http";
import { runCli, withHttpServer } from "./helpers.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()?.(); });

const state = Buffer.from(JSON.stringify({
  cookies: [{ name: "connect.sid", value: "s%3Aendpoint-test", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
  origins: [],
})).toString("base64");

function parsedUrl(request: IncomingMessage): URL { return new URL(request.url ?? "", "http://local"); }

async function captureRequest(args: string[]): Promise<{ request: IncomingMessage; body: string; output: any }> {
  let captured: IncomingMessage | undefined;
  let body = "";
  let requestCount = 0;
  let resolveBody: (() => void) | undefined;
  const bodyReceived = new Promise<void>((resolve) => { resolveBody = resolve; });
  const server = await withHttpServer((request, response) => {
    requestCount += 1;
    if (requestCount > 1) { response.statusCode = 500; response.end("unexpected retry"); return; }
    captured = request;
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ accepted: true }));
      resolveBody?.();
    });
  });
  closers.push(server.close);
  const expanded = args.map((arg) => arg === "$ORIGIN" ? server.origin : arg);
  const result = await runCli(["--account-origin", server.origin, "--state-env", "TEST_SUBSTACK_STATE", ...expanded], { TEST_SUBSTACK_STATE: state });
  expect(result.code).toBe(0);
  await Promise.race([bodyReceived, new Promise((_, reject) => setTimeout(() => reject(new Error("CLI exited without sending the expected request")), 1_000))]);
  expect(requestCount).toBe(1);
  if (!captured) throw new Error("CLI did not make a request");
  return { request: captured, body, output: JSON.parse(result.stdout) };
}

async function expectConfirmationRequired(args: string[]): Promise<void> {
  let requests = 0;
  const server = await withHttpServer((_request, response) => { requests += 1; response.end("{}"); });
  closers.push(server.close);
  const expanded = args.map((arg) => arg === "$ORIGIN" ? server.origin : arg);
  const result = await runCli(["--account-origin", server.origin, "--state-env", "TEST_SUBSTACK_STATE", ...expanded], { TEST_SUBSTACK_STATE: state });
  expect(result.code).toBe(2);
  expect(JSON.parse(result.stderr).error.code).toBe("CONFIRMATION_REQUIRED");
  expect(requests).toBe(0);
}

describe("verified authenticated endpoint coverage", () => {
  test("discovers owned publications through the account profile", async () => {
    const { request } = await captureRequest(["publication", "owned"]);
    expect(request.method).toBe("GET");
    expect(parsedUrl(request).pathname).toBe("/api/v1/user/profile/self");
    const cookies = Object.fromEntries((request.headers.cookie ?? "").split("; ").map((pair) => pair.split("=")));
    expect(cookies["connect.sid"]).toBe("s%3Aendpoint-test");
  });

  test("reads and updates publication settings", async () => {
    const read = await captureRequest(["publication", "settings", "--publication-url", "$ORIGIN"]);
    expect(parsedUrl(read.request).pathname).toBe("/api/v1/publication_settings");
    await expectConfirmationRequired(["publication", "update", "--publication-url", "$ORIGIN", "--data", "{\"name\":\"New Name\"}"]);
    const update = await captureRequest(["publication", "update", "--publication-url", "$ORIGIN", "--data", "{\"name\":\"New Name\"}", "--confirm"]);
    expect(update.request.method).toBe("PUT");
    expect(parsedUrl(update.request).pathname).toBe("/api/v1/publication");
    expect(JSON.parse(update.body)).toEqual({ name: "New Name" });
  });

  test("lists drafts and schedules one", async () => {
    const drafts = await captureRequest(["post", "drafts", "--publication-url", "$ORIGIN", "--limit", "5"]);
    const draftsUrl = parsedUrl(drafts.request);
    expect(draftsUrl.pathname).toBe("/api/v1/post_management/drafts");
    expect(Object.fromEntries(draftsUrl.searchParams)).toEqual({ offset: "0", limit: "5", order_by: "draft_updated_at", order_direction: "desc" });
    const scheduleArgs = ["post", "schedule", "--publication-url", "$ORIGIN", "--draft-id", "44", "--at", "2027-01-01T12:00:00.000Z", "--audience", "everyone"];
    await expectConfirmationRequired(scheduleArgs);
    const schedule = await captureRequest([...scheduleArgs, "--confirm"]);
    expect(schedule.request.method).toBe("POST");
    expect(parsedUrl(schedule.request).pathname).toBe("/api/v1/drafts/44/scheduled_release");
    expect(JSON.parse(schedule.body)).toEqual({ trigger_at: "2027-01-01T12:00:00.000Z", post_audience: "everyone" });
  });

  test("creates a Note as complete ProseMirror JSON", async () => {
    const args = ["note", "create", "--text", "Hello\n\nWorld", "--reply-minimum-role", "everyone"];
    await expectConfirmationRequired(args);
    const { request, body } = await captureRequest([...args, "--confirm"]);
    expect(request.method).toBe("POST");
    expect(parsedUrl(request).pathname).toBe("/api/v1/comment/feed");
    expect(JSON.parse(body)).toMatchObject({
      replyMinimumRole: "everyone",
      bodyJson: { type: "doc", attrs: { schemaVersion: "v1", title: null }, content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        { type: "paragraph", content: [{ type: "text", text: "World" }] },
      ] },
    });
  });

  test("reads comments and the reader inbox", async () => {
    const commentsUrl = parsedUrl((await captureRequest(["comment", "list", "--publication-url", "$ORIGIN", "--post-id", "55", "--limit", "20"])).request);
    expect(commentsUrl.pathname).toBe("/api/v1/post/55/comments");
    expect(Object.fromEntries(commentsUrl.searchParams)).toEqual({ all_comments: "true", limit: "20" });
    const inboxUrl = parsedUrl((await captureRequest(["reader", "inbox", "--limit", "12"])).request);
    expect(inboxUrl.pathname).toBe("/api/v1/inbox/top");
    expect(Object.fromEntries(inboxUrl.searchParams)).toEqual({ inboxType: "inbox", surface: "inbox_all", limit: "12" });
  });

  test("lists subscribers using the verified filter body", async () => {
    const { request, body } = await captureRequest(["subscriber", "list", "--publication-url", "$ORIGIN", "--limit", "25", "--offset", "10"]);
    expect(request.method).toBe("POST");
    expect(parsedUrl(request).pathname).toBe("/api/v1/subscriber-stats");
    expect(JSON.parse(body)).toEqual({ filters: { order_by_desc_nulls_last: "subscription_created_at" }, limit: 25, offset: 10 });
  });

  test("adds a recommendation with explicit confirmation", async () => {
    const args = ["recommendation", "add", "--publication-url", "$ORIGIN", "--from-publication-id", "4", "--publication-id", "9"];
    await expectConfirmationRequired(args);
    const { request, body } = await captureRequest([...args, "--confirm"]);
    expect(request.method).toBe("PUT");
    expect(parsedUrl(request).pathname).toBe("/api/v1/recommendations");
    expect(JSON.parse(body)).toEqual({
      recommended_publication_id: 9,
      recommending_publication_id: 4,
      source: "manual-search",
      suggested: false,
    });
  });

  test("reads analytics, chat, live streams, and cross-post status", async () => {
    const analyticsUrl = parsedUrl((await captureRequest(["analytics", "summary", "--publication-url", "$ORIGIN", "--range", "30"])).request);
    expect(analyticsUrl.pathname).toBe("/api/v1/publish-dashboard/summary-v2");
    expect(analyticsUrl.searchParams.get("range")).toBe("30");
    expect(parsedUrl((await captureRequest(["chat", "list", "--publication-id", "77"])).request).pathname).toBe("/api/v1/community/publications/77/posts");
    expect(parsedUrl((await captureRequest(["live", "streams", "--publication-url", "$ORIGIN"])).request).pathname).toBe("/api/v1/live_streams");
    expect(parsedUrl((await captureRequest(["crosspost", "linkedin", "--publication-url", "$ORIGIN"])).request).pathname).toBe("/api/v1/video/linkedin/check-authorization");
  });
});
