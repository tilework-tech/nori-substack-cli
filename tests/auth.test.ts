import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runCli } from "./helpers.js";

describe("storage-state authentication", () => {
  test("imports state into an owner-only file and exports it losslessly", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "nori-substack-auth-"));
    const statePath = path.join(directory, "state.json");
    const state = {
      cookies: [{ name: "connect.sid", value: "s%3Atest", domain: ".substack.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }],
      origins: [],
    };
    const encoded = Buffer.from(JSON.stringify(state)).toString("base64");

    const imported = await runCli(["--state", statePath, "auth", "import", "--base64", encoded, "--confirm"]);
    expect(imported.code).toBe(0);
    expect(JSON.parse(imported.stdout).data.cookieCount).toBe(1);
    expect((await stat(statePath)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual(state);

    const exported = await runCli(["--state", statePath, "auth", "export"]);
    expect(exported.code).toBe(0);
    expect(JSON.parse(Buffer.from(JSON.parse(exported.stdout).data.base64, "base64").toString("utf8"))).toEqual(state);
  });

  test("rejects malformed state without writing a file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "nori-substack-auth-"));
    const statePath = path.join(directory, "state.json");

    const invalid = Buffer.from(JSON.stringify({ cookies: "not-an-array", origins: [] })).toString("base64");
    const result = await runCli(["--state", statePath, "auth", "import", "--base64", invalid, "--confirm"]);

    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("INVALID_STORAGE_STATE");
    await expect(readFile(statePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
