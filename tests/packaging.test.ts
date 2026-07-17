import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const exec = promisify(execFile);

describe("GitHub-installable package", () => {
  test("builds the declared executable and packs bundled source", async () => {
    await exec("npm", ["run", "build"], { cwd: process.cwd() });
    const version = await exec(process.execPath, ["dist/index.js", "--version"], { cwd: process.cwd() });
    expect(version.stdout.trim()).toBe("0.1.0");

    const packed = await exec("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], { cwd: process.cwd() });
    const manifest = JSON.parse(packed.stdout)[0];
    const files = manifest.files.map((file: { path: string }) => file.path);
    expect(files).toContain("dist/index.js");
    expect(files).toContain("src/index.ts");
    expect(files.some((file: string) => file.startsWith("tests/"))).toBe(false);
    expect(files.some((file: string) => /storage-state|\.env$/.test(file))).toBe(false);
  }, 20_000);
});
