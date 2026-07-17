import { afterEach, describe, expect, test } from "vitest";
import { runCli, withHttpServer } from "./helpers.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()?.(); });

describe("actionable errors", () => {
  test("a mistyped family suggests the closest command and source", async () => {
    const result = await runCli(["publcation"]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown command 'publcation'");
    expect(result.stderr).toContain("Did you mean 'publication'?");
    expect(result.stderr).toMatch(/Source: .*src\/commands\/program\.ts/);
  });

  test("errors are structured JSON without credential leakage", async () => {
    const secret = "s%3Asecret-cookie-value";
    const server = await withHttpServer((request, response) => {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: `upstream rejected ${request.headers.cookie}` }));
    });
    closers.push(server.close);
    const result = await runCli(["--account-origin", server.origin, "--state-env", "TEST_SUBSTACK_STATE", "profile", "me"], {
      TEST_SUBSTACK_STATE: Buffer.from(JSON.stringify({
        cookies: [{ name: "connect.sid", value: secret, domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
        origins: [],
      })).toString("base64"),
    });

    expect(result.code).not.toBe(0);
    const error = JSON.parse(result.stderr);
    expect(error.ok).toBe(false);
    expect(error.error.code).toBeTruthy();
    expect(result.stdout).not.toContain(secret);
    expect(result.stderr).not.toContain(secret);
  });
});
