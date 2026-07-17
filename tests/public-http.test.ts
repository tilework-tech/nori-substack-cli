import { afterEach, describe, expect, test } from "vitest";
import type { IncomingMessage } from "node:http";
import { runCli, withHttpServer } from "./helpers.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()?.(); });

describe("unauthenticated public reads", () => {
  test("reads publication metadata without auth state", async () => {
    let request: IncomingMessage | undefined;
    const server = await withHttpServer((incoming, response) => {
      request = incoming;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ id: 42, name: "Carbon", subdomain: "carbon" }));
    });
    closers.push(server.close);

    const result = await runCli(["publication", "get", "--url", server.origin]);

    expect(result.code).toBe(0);
    expect(request?.url).toBe("/api/v1/publication");
    expect(request?.headers.cookie).toBeUndefined();
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({ ok: true, command: "publication.get", data: { id: 42, name: "Carbon" } });
  });

  test("encodes pagination when listing public posts", async () => {
    let requestedUrl = "";
    const server = await withHttpServer((request, response) => {
      requestedUrl = request.url ?? "";
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{ id: 7, slug: "hello", title: "Hello" }]));
    });
    closers.push(server.close);

    const result = await runCli(["post", "list", "--publication-url", server.origin, "--limit", "2", "--offset", "4"]);

    expect(result.code).toBe(0);
    expect(requestedUrl).toBe("/api/v1/posts?limit=2&offset=4");
    expect(JSON.parse(result.stdout).data).toEqual([{ id: 7, slug: "hello", title: "Hello" }]);
  });

  test("returns a detailed retry-safe error for rate limiting", async () => {
    const server = await withHttpServer((_request, response) => {
      response.statusCode = 429;
      response.setHeader("retry-after", "0");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: "rate limit exceeded" }));
    });
    closers.push(server.close);

    const result = await runCli(["publication", "get", "--url", server.origin]);

    expect(result.code).toBe(9);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED", retrySafe: true, retryAfterSeconds: 0 },
    });
  });
});
