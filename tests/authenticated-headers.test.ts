import { afterEach, describe, expect, test } from "vitest";
import { runCli, withHttpServer } from "./helpers.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()?.(); });

const state = Buffer.from(JSON.stringify({
  cookies: [{ name: "substack.sid", value: "s%3Aheaders", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
  origins: [],
})).toString("base64");

async function captureHeaders(args: string[]): Promise<{ origin: string; headers: NodeJS.Dict<string | string[]> }> {
  let headers: NodeJS.Dict<string | string[]> | undefined;
  const server = await withHttpServer((request, response) => {
    headers = request.headers;
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end("{\"ok\":true}");
    });
  });
  closers.push(server.close);
  const expanded = args.map((arg) => arg === "$ORIGIN" ? server.origin : arg);
  const result = await runCli(["--account-origin", server.origin, "--state-env", "HEADERS_STATE", ...expanded], { HEADERS_STATE: state });
  expect(result.code, result.stderr).toBe(0);
  if (!headers) throw new Error("Expected one HTTP request");
  return { origin: server.origin, headers };
}

describe("authenticated request browser-parity headers", () => {
  test("subscriber list sends same-origin Origin and a Referer under /publish", async () => {
    const { origin, headers } = await captureHeaders(["subscriber", "list", "--publication-url", "$ORIGIN"]);
    expect(headers.origin).toBe(origin);
    expect(typeof headers.referer).toBe("string");
    expect(headers.referer).toMatch(new RegExp(`^${origin}/publish(/|$)`));
  });
});
