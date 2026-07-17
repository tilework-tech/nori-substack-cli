import { describe, expect, test } from "vitest";
import { runCli } from "./helpers.js";

describe("agent-oriented help", () => {
  test("bare invocation explains the tool, commands, and source", async () => {
    const result = await runCli([]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Use this CLI tool to operate Substack");
    expect(result.stdout).toContain("publication");
    expect(result.stdout).toContain("post");
    expect(result.stdout).toContain("auth");
    expect(result.stdout).toMatch(/Source: .*src\/index\.ts/);
    expect(result.stdout).not.toContain("\u001b[");
  });

  test("operation help describes flags and its source", async () => {
    const result = await runCli(["post", "publish", "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Use this command to publish");
    expect(result.stdout).toContain("--draft-id");
    expect(result.stdout).toContain("--confirm");
    expect(result.stdout).toMatch(/Source: .*src\/commands\/program\.ts#post\.publish/);
  });
});
