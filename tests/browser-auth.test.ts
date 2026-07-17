import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runCli } from "./helpers.js";

const state = {
  cookies: [{ name: "connect.sid", value: "s%3Abrowser", domain: ".substack.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }],
  origins: [],
};

describe("browser authentication lifecycle", () => {
  test("uses the documented owner-only default storage-state path", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "nori-substack-home-"));
    const encoded = Buffer.from(JSON.stringify(state)).toString("base64");
    const imported = await runCli(["auth", "import", "--base64", encoded, "--confirm"], { HOME: home });
    expect(imported.code, imported.stderr).toBe(0);
    const statePath = path.join(home, ".local/share/noriagent/substack-storage-state.json");
    expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual(state);
    expect((await stat(statePath)).mode & 0o777).toBe(0o600);
    const status = await runCli(["auth", "status"], { HOME: home });
    expect(JSON.parse(status.stdout).data).toMatchObject({ authenticated: true, source: statePath });
  });

  test("requires confirmation before CDP capture and reports connection failures structurally", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "nori-substack-home-"));
    const args = ["auth", "capture", "--cdp", "http://127.0.0.1:1"];
    const unconfirmed = await runCli(args, { HOME: home });
    expect(unconfirmed.code).toBe(2);
    expect(JSON.parse(unconfirmed.stderr).error.code).toBe("CONFIRMATION_REQUIRED");
    const failed = await runCli([...args, "--confirm"], { HOME: home });
    expect(failed.code).toBe(5);
    expect(JSON.parse(failed.stderr).error.code).toBe("CDP_CONNECTION_FAILED");
  });

  test("stops a hosted auth bridge idempotently", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "nori-substack-home-"));
    const hostState = path.join(home, "host.json");
    const result = await runCli(["auth", "host", "--stop", "--confirm"], { HOME: home, NORI_SUBSTACK_HOST_STATE: hostState });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).data).toEqual({ stopped: false, reason: "no bridge running" });
  });
});
