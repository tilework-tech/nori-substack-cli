import { afterEach, describe, expect, test } from "vitest";
import { runCli, withHttpServer } from "./helpers.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()?.(); });

const fastRetries = { NORI_SUBSTACK_HTTP_RETRIES: "2", NORI_SUBSTACK_HTTP_RETRY_DELAY_MS: "0" };

function challenge(response: import("node:http").ServerResponse): void {
  response.statusCode = 403;
  response.setHeader("cf-mitigated", "challenge");
  response.setHeader("content-type", "text/html");
  response.end("<html>Just a moment...</html>");
}

describe("public read retries", () => {
  test("retries a Cloudflare challenge and succeeds once it clears", async () => {
    let requests = 0;
    const server = await withHttpServer((_request, response) => {
      requests += 1;
      if (requests === 1) return challenge(response);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ id: 42, name: "Carbon" }));
    });
    closers.push(server.close);

    const result = await runCli(["publication", "get", "--url", server.origin], fastRetries);

    expect(result.code).toBe(0);
    expect(requests).toBe(2);
    expect(JSON.parse(result.stdout).data).toMatchObject({ id: 42 });
  });

  test("reports a persistent Cloudflare challenge as a typed retry-safe IP block", async () => {
    let requests = 0;
    const server = await withHttpServer((_request, response) => { requests += 1; challenge(response); });
    closers.push(server.close);

    const result = await runCli(["publication", "get", "--url", server.origin], fastRetries);

    expect(result.code).toBe(8);
    expect(requests).toBe(3);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: { code: "CLOUDFLARE_CHALLENGE", retrySafe: true, status: 403, cfMitigated: "challenge", attempts: 3 },
    });
  });

  test("retries 5xx responses on public reads", async () => {
    let requests = 0;
    const server = await withHttpServer((_request, response) => {
      requests += 1;
      if (requests < 3) { response.statusCode = 503; response.end("unavailable"); return; }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{ id: 7 }]));
    });
    closers.push(server.close);

    const result = await runCli(["post", "list", "--publication-url", server.origin], fastRetries);

    expect(result.code).toBe(0);
    expect(requests).toBe(3);
  });

  test("does not retry a plain 403 without a Cloudflare challenge", async () => {
    const paths: string[] = [];
    const server = await withHttpServer((request, response) => {
      paths.push(request.url ?? "");
      response.statusCode = 403;
      response.end("Not authorized");
    });
    closers.push(server.close);

    const result = await runCli(["post", "list", "--publication-url", server.origin], fastRetries);

    expect(result.code).toBe(8);
    expect(paths).toHaveLength(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: "HTTP_ERROR", status: 403 } });
  });
});
