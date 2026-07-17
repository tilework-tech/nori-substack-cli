import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";

const execute = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) await rm(tempDirs.pop()!, { recursive: true, force: true });
});

test("installs from Git without a TypeScript toolchain", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nori-substack-git-install-"));
  tempDirs.push(root);
  const source = path.join(root, "source");
  const consumer = path.join(root, "consumer");
  await mkdir(source);
  await mkdir(consumer);
  await cp(path.resolve("dist"), path.join(source, "dist"), { recursive: true });

  const manifest = JSON.parse(await readFile("package.json", "utf8")) as Record<string, unknown>;
  manifest.private = false;
  manifest.devDependencies = {};
  await writeFile(path.join(source, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  await execute("git", ["init"], { cwd: source });
  await execute("git", ["config", "user.email", "test@example.com"], { cwd: source });
  await execute("git", ["config", "user.name", "Install Test"], { cwd: source });
  await execute("git", ["add", "."], { cwd: source });
  await execute("git", ["commit", "-m", "fixture"], { cwd: source });
  await writeFile(path.join(consumer, "package.json"), `{"private":true}\n`, "utf8");

  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is required");
  const pathWithoutProjectBins = (process.env.PATH ?? "").split(path.delimiter).filter((entry) => !entry.includes("node_modules/.bin")).join(path.delimiter);
  await execute(process.execPath, [npmCli, "install", `git+file://${source}`, "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: consumer,
    env: { ...process.env, PATH: pathWithoutProjectBins },
  });

  const executable = path.join(consumer, "node_modules", ".bin", "nori-substack");
  const result = await execute(executable, ["--help"], { cwd: consumer });
  expect(result.stdout).toContain("Use this CLI tool to operate Substack.");
});
