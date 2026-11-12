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

  test("continues a public post listing with its opaque cursor", async () => {
    let requestedUrl = "";
    const server = await withHttpServer((request, response) => {
      requestedUrl = request.url ?? "";
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ posts: [{ id: 7, slug: "hello", title: "Hello" }], nextCursor: "next+/=" }));
    });
    closers.push(server.close);

    const result = await runCli(["post", "list", "--publication-url", server.origin, "--limit", "2", "--cursor", "previous+/="]);

    expect(result.code).toBe(0);
    expect(new URL(requestedUrl, server.origin).pathname).toBe("/api/v1/posts");
    expect(new URL(requestedUrl, server.origin).searchParams.get("limit")).toBe("2");
    expect(new URL(requestedUrl, server.origin).searchParams.has("offset")).toBe(false);
    expect(new URL(requestedUrl, server.origin).searchParams.get("cursor")).toBe("previous+/=");
    expect(JSON.parse(result.stdout).data).toEqual([{ id: 7, slug: "hello", title: "Hello" }]);
    expect(JSON.parse(result.stdout).pagination).toEqual({ nextCursor: "next+/=" });
  });

  test.each([{ args: [] }, { args: ["--offset", "0"] }])("lists the first page without an upstream offset: %j", async ({ args }) => {
    const server = await withHttpServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (new URL(request.url!, "http://localhost").searchParams.has("offset")) {
        response.statusCode = 400;
        response.end(JSON.stringify({ errors: [{ param: "offset", msg: "Invalid value" }] }));
      } else response.end(JSON.stringify({ posts: [{ id: 223828762 }], nextCursor: null }));
    });
    closers.push(server.close);
    const result = await runCli(["post", "list", "--publication-url", server.origin, ...args]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ data: [{ id: 223828762 }], pagination: { nextCursor: null } });
  });

  test("still reads a legacy array listing", async () => {
    const server = await withHttpServer((_request, response) => response.end(JSON.stringify([{ id: 7 }])));
    closers.push(server.close);
    const result = await runCli(["post", "list", "--publication-url", server.origin]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).data).toEqual([{ id: 7 }]);
  });

  test.each([{}, { posts: null }, { posts: [], nextCursor: 42 }])("refuses an invalid listing instead of reporting no posts: %j", async (body) => {
    const server = await withHttpServer((_request, response) => response.end(JSON.stringify(body)));
    closers.push(server.close);
    const result = await runCli(["post", "list", "--publication-url", server.origin]);
    expect(result.code).toBe(8);
    expect(JSON.parse(result.stderr).error.code).toBe("INVALID_RESPONSE");
  });

  test("explains cursor pagination instead of sending an unsupported nonzero offset", async () => {
    const result = await runCli(["post", "list", "--publication-url", "http://127.0.0.1:1", "--offset", "20"]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr).error).toMatchObject({ code: "INVALID_ARGUMENT", message: expect.stringMatching(/cursor/) });
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
