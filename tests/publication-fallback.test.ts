import { afterEach, expect, test } from "vitest";
import { runCli, withHttpServer } from "./helpers.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()?.(); });

test("falls back to public homepage preload metadata when the JSON endpoint is forbidden", async () => {
  const paths: string[] = [];
  const publication = { id: 42, name: "Carbon", subdomain: "carbon", author_name: "A Writer" };
  const preloadJson = JSON.stringify({ pub: publication });
  const assignment = JSON.stringify(preloadJson);
  const server = await withHttpServer((request, response) => {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    paths.push(pathname);
    if (pathname === "/api/v1/publication") { response.statusCode = 403; response.end("Not authorized"); return; }
    response.setHeader("content-type", "text/html");
    response.end(`<html><head><script>window._preloads = JSON.parse(${assignment})</script></head></html>`);
  });
  closers.push(server.close);

  const result = await runCli(["publication", "get", "--url", server.origin]);

  expect(result.code, result.stderr).toBe(0);
  expect(paths).toEqual(["/api/v1/publication", "/"]);
  expect(JSON.parse(result.stdout).data).toEqual(publication);
});
