import { afterEach, expect, test } from "vitest";
import { runCli, withHttpServer } from "./helpers.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()?.(); });

test("mutations fail before network access without explicit confirmation", async () => {
  let requests = 0;
  const server = await withHttpServer((_request, response) => {
    requests += 1;
    response.end("{}");
  });
  closers.push(server.close);

  const result = await runCli(["post", "delete", "--publication-url", server.origin, "--draft-id", "91"]);

  expect(result.code).toBe(2);
  expect(JSON.parse(result.stderr).error.code).toBe("CONFIRMATION_REQUIRED");
  expect(requests).toBe(0);
});

test("a confirmed mutation reaches the configured publication", async () => {
  let method = "";
  let requestedUrl = "";
  const server = await withHttpServer((request, response) => {
    method = request.method ?? "";
    requestedUrl = request.url ?? "";
    response.setHeader("content-type", "application/json");
    response.end("{}");
  });
  closers.push(server.close);
  const state = Buffer.from(JSON.stringify({
    cookies: [{ name: "connect.sid", value: "s%3Atest", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
    origins: [],
  })).toString("base64");

  const result = await runCli([
    "--state-env", "TEST_SUBSTACK_STATE", "post", "delete", "--publication-url", server.origin, "--draft-id", "92", "--confirm",
  ], { TEST_SUBSTACK_STATE: state });

  expect(result.code).toBe(0);
  expect(method).toBe("DELETE");
  expect(requestedUrl).toBe("/api/v1/drafts/92");
});

test("publish dry-run returns the exact impact without auth or network", async () => {
  let requests = 0;
  const server = await withHttpServer((_request, response) => {
    requests += 1;
    response.end("{}");
  });
  closers.push(server.close);
  const result = await runCli([
    "post", "publish", "--publication-url", server.origin, "--draft-id", "91", "--send-email", "--dry-run",
  ]);

  expect(result.code).toBe(0);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({
    ok: true,
    command: "post.publish",
    dryRun: true,
    data: {
      method: "PUT",
      body: { send: true, share_automatically: false },
    },
  });
  expect(output.data.url).toBe(`${server.origin}/api/v1/drafts/91/publish`);
  expect(output.data.impact).toContain("emails subscribers");
  expect(requests).toBe(0);
});
