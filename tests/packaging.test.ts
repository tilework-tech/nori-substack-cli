import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const exec = promisify(execFile);

describe("GitHub-installable package", () => {
  test("builds the declared executable and packs bundled source", async () => {
    await exec("npm", ["run", "compile"], { cwd: process.cwd() });
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

  // npm/pacote clones a git dependency and runs a full devDependency install (its
  // "prepare" path) whenever package.json declares any of these scripts, even
  // though only `prepare` ever executes on a git install. That nested install is
  // what breaks `npm install -g git+...` on constrained runtimes, so the
  // git-install manifest must declare none of them and rely on committed dist/.
  test("declares none of npm's git-install preparation triggers", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const triggers = ["preinstall", "install", "postinstall", "prepare", "prepack", "build"];
    expect(triggers.filter((name) => pkg.scripts?.[name])).toEqual([]);
    expect(pkg.workspaces).toBeUndefined();
  });

  test("still builds and tests before publishing", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts.prepublishOnly).toContain("compile");
    expect(pkg.scripts.prepublishOnly).toContain("test");
  });
});
