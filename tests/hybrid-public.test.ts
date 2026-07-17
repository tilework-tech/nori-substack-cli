import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runCli, withHttpServer } from "./helpers.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()?.(); });

describe("hybrid authenticated and unauthenticated reads", () => {
  test("uses the default storage-state file for authenticated API commands", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "nori-substack-default-auth-"));
    const statePath = path.join(home, ".local/share/noriagent/substack-storage-state.json");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(path.dirname(statePath), { recursive: true }));
    await writeFile(statePath, JSON.stringify({ cookies: [{ name: "connect.sid", value: "s%3Adefault", domain: "127.0.0.1", path: "/" }], origins: [] }), { mode: 0o600 });
    let cookie = "";
    const server = await withHttpServer((request, response) => { cookie = request.headers.cookie ?? ""; response.setHeader("content-type", "application/json"); response.end("{\"id\":1}"); });
    closers.push(server.close);
    const result = await runCli(["--account-origin", server.origin, "profile", "me"], { HOME: home });
    expect(result.code, result.stderr).toBe(0);
    expect(cookie).toContain("connect.sid=s%3Adefault");
  });

  test("reads profiles, comments, and archives with no credential state", async () => {
    const paths: string[] = [];
    const server = await withHttpServer((request, response) => { paths.push(new URL(request.url ?? "", "http://local").pathname); response.setHeader("content-type", "application/json"); response.end("{\"ok\":true}"); });
    closers.push(server.close);
    const home = await mkdtemp(path.join(os.tmpdir(), "nori-substack-no-auth-"));
    for (const args of [
      ["--account-origin", server.origin, "profile", "get", "--user-id", "12", "--handle", "alice"],
      ["comment", "list", "--publication-url", server.origin, "--post-id", "7"],
      ["publication", "archive", "--publication-url", server.origin],
    ]) {
      const result = await runCli(args, { HOME: home, NORIAGENT_SUBSTACK_STORAGE_B64: "" });
      expect(result.code, result.stderr).toBe(0);
    }
    expect(paths).toEqual(["/api/v1/user/12-alice/public_profile/self", "/api/v1/post/7/comments", "/api/v1/archive"]);
  });

  test("exposes unauthenticated global category and web search", async () => {
    const urls: URL[] = [];
    const server = await withHttpServer((request, response) => { urls.push(new URL(request.url ?? "", "http://local")); response.setHeader("content-type", "application/json"); response.end("{\"ok\":true}"); });
    closers.push(server.close);
    const home = await mkdtemp(path.join(os.tmpdir(), "nori-substack-no-auth-"));
    expect((await runCli(["--account-origin", server.origin, "discover", "categories"], { HOME: home })).code).toBe(0);
    expect((await runCli(["--account-origin", server.origin, "discover", "search", "--query", "climate"], { HOME: home })).code).toBe(0);
    expect(urls[0].pathname).toBe("/api/v1/categories");
    expect(urls[1].pathname).toBe("/api/v1/search/explore/web");
    expect(urls[1].searchParams.get("query")).toBe("climate");
  });
});
