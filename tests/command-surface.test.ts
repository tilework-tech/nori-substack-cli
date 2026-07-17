import { expect, test } from "vitest";
import { runCli } from "./helpers.js";

test("top-level help exposes public, authenticated, and operational command families", async () => {
  const result = await runCli(["--help"]);

  expect(result.code).toBe(0);
  for (const family of ["auth", "publication", "post", "reader", "analytics", "media"]) {
    expect(result.stdout).toMatch(new RegExp(`\\b${family}\\b`));
  }
});

test("family help exposes representative verified operations", async () => {
  const expectations: Array<[string, string[]]> = [
    ["publication", ["get", "owned", "search", "settings", "update", "sections", "tags", "export"]],
    ["post", ["list", "get", "drafts", "create", "update", "delete", "publish", "schedule", "stats"]],
    ["note", ["feed", "profile", "get", "drafts", "create", "reply", "delete", "mark-seen"]],
    ["subscriber", ["list", "add", "remove", "import-status"]],
    ["analytics", ["summary", "post", "email", "growth", "network", "pledges"]],
  ];

  for (const [family, operations] of expectations) {
    const result = await runCli([family, "--help"]);
    expect(result.code).toBe(0);
    for (const operation of operations) expect(result.stdout).toMatch(new RegExp(`\\b${operation}\\b`));
  }
});
