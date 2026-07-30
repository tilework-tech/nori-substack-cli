import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { runCli, withHttpServer } from "./helpers.js";

const closers: Array<() => Promise<void>> = [];
const tempDirs: string[] = [];

afterEach(async () => {
  while (closers.length) await closers.pop()?.();
  while (tempDirs.length) await rm(tempDirs.pop()!, { recursive: true, force: true });
});

async function tempOutput(name: string): Promise<{ directory: string; output: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nori-substack-export-"));
  tempDirs.push(directory);
  return { directory, output: path.join(directory, name) };
}

test("exports a public Substack post as a portable article bundle", async () => {
  const server = await withHttpServer((request, response) => {
    expect(request.url).toBe("/api/v1/posts/agent-first");
    expect(request.headers.cookie).toBeUndefined();
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      title: "Agents from Modal",
      canonical_url: `${server.origin}/p/agent-first`,
      cover_image: `${server.origin}/cover.png`,
      body_html: `<p>Keep “from Modal” verbatim.</p><p class="button-wrapper"><a class="button primary" href="https://luma.com/agentics-4qd8"><span>Click Here for Agentics Flagship Meetup</span></a></p><div class="subscription-widget">Subscribe now</div><div><hr></div><div class="captioned-image-container"><img src="${server.origin}/diagram.png"><figcaption>A diagram</figcaption></div><div id="youtube2-p-e4dHJTTuM" class="youtube-wrap"><div class="youtube-inner"><iframe src="https://www.youtube-nocookie.com/embed/p-e4dHJTTuM?rel=0" frameborder="0"></iframe></div></div><div class="footnote"><span class="footnote-number">1</span><span class="footnote-content">Source note</span></div>`,
    }));
  });
  closers.push(server.close);
  const { output } = await tempOutput("article.json");

  const result = await runCli(["post", "export", "--url", `${server.origin}/p/agent-first`, "--output", output]);

  expect(result.code).toBe(0);
  const bundle = JSON.parse(await readFile(output, "utf8"));
  expect(bundle).toMatchObject({
    kind: "article",
    title: "Agents from Modal",
    canonicalUrl: `${server.origin}/p/agent-first`,
    coverUrl: `${server.origin}/cover.png`,
    images: [{ url: `${server.origin}/diagram.png`, caption: "A diagram" }],
  });
  expect(bundle.html).toContain("Keep “from Modal” verbatim.");
  expect(bundle.html).toContain("[[NORI_DIVIDER]]");
  expect(bundle.html).toContain("[[NORI_IMAGE:0]]");
  expect(bundle.html).toContain("[1] Source note");
  expect(bundle.html).not.toContain("Subscribe now");
  // Video embeds are preserved as links (X Articles cannot embed players), not dropped.
  expect(bundle.videos).toHaveLength(1);
  expect(bundle.videos[0]).toMatchObject({ id: "p-e4dHJTTuM", url: "https://www.youtube.com/watch?v=p-e4dHJTTuM" });
  expect(bundle.html).toContain('href="https://www.youtube.com/watch?v=p-e4dHJTTuM"');
  expect(bundle.html).not.toContain("[[NORI_VIDEO");
  expect(bundle.html).not.toContain("youtube-nocookie");
  // CTA / signup buttons are preserved as links (X has no button element), not dropped.
  expect(bundle.html).toContain('<a href="https://luma.com/agentics-4qd8">Click Here for Agentics Flagship Meetup</a>');
  expect(bundle.html).not.toContain("button-wrapper");
});

test("exports only recent top-level Notes from the requested author", async () => {
  const now = Date.now();
  const note = (overrides: Record<string, unknown>) => ({
    id: 101,
    user_id: 9744387,
    type: "feed",
    ancestor_path: "",
    date: new Date(now - 30 * 60_000).toISOString(),
    body_json: { content: [
      { type: "paragraph", content: [{ type: "text", text: "intro" }] },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "quoted" }] }] },
    ] },
    attachments: [
      { type: "image", imageUrl: "https://cdn.example/note.png" },
      { type: "link", linkMetadata: { url: "https://example.com/read" } },
    ],
    ...overrides,
  });
  const server = await withHttpServer((request, response) => {
    expect(request.url).toBe("/api/v1/reader/feed/profile/9744387?types=note&limit=20");
    expect(request.headers.cookie).toBeUndefined();
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ items: [
      { comment: note({}) },
      { comment: note({ id: 102, date: new Date(now - 10 * 3_600_000).toISOString() }) },
      { comment: note({ id: 103, user_id: 12 }) },
      { comment: note({ id: 104, ancestor_path: "101." }) },
    ] }));
  });
  closers.push(server.close);
  const { output } = await tempOutput("notes.json");

  const result = await runCli(["--account-origin", server.origin, "note", "export", "--user-id", "9744387", "--lookback-hours", "4", "--output", output]);

  expect(result.code).toBe(0);
  const artifact = JSON.parse(await readFile(output, "utf8"));
  expect(artifact).toMatchObject({ version: 1, kind: "posts" });
  expect(artifact.posts).toEqual([{
    id: "101",
    text: "intro\n\n> quoted\n\nhttps://example.com/read",
    images: ["https://cdn.example/note.png"],
    publishedAt: expect.any(String),
  }]);
});

test("a forced Note id is exported even when it is outside the lookback window", async () => {
  const server = await withHttpServer((request, response) => {
    expect(request.url).toBe("/api/v1/reader/feed/profile/9744387?types=note&limit=20");
    expect(request.headers.cookie).toBeUndefined();
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ items: [{ comment: {
      id: 202,
      user_id: 9744387,
      type: "feed",
      ancestor_path: "",
      date: "2020-01-01T00:00:00.000Z",
      body: "approved old note",
      attachments: [],
    } }] }));
  });
  closers.push(server.close);
  const { output } = await tempOutput("forced-note.json");

  const result = await runCli(["--account-origin", server.origin, "note", "export", "--user-id", "9744387", "--note-id", "202", "--lookback-hours", "4", "--output", output]);

  expect(result.code).toBe(0);
  expect(JSON.parse(await readFile(output, "utf8")).posts).toEqual([{
    id: "202",
    text: "approved old note",
    images: [],
    publishedAt: "2020-01-01T00:00:00.000Z",
  }]);
});
test("fails explicitly when a forced Note id is not in the public feed", async () => {
  const server = await withHttpServer((request, response) => {
    expect(request.url).toBe("/api/v1/reader/feed/profile/9744387?types=note&limit=20");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ items: [] }));
  });
  closers.push(server.close);
  const { output } = await tempOutput("missing-note.json");

  const result = await runCli(["--account-origin", server.origin, "note", "export", "--user-id", "9744387", "--note-id", "999", "--output", output]);

  expect(result.code).toBe(8);
  expect(JSON.parse(result.stderr)).toMatchObject({
    error: {
      code: "NOT_FOUND",
      message: "Note 999 was not found in the public profile feed.",
    },
  });
});
test("follows public profile pagination to find a forced Note id", async () => {
  let page = 0;
  const server = await withHttpServer((request, response) => {
    page += 1;
    response.setHeader("content-type", "application/json");
    if (page === 1) {
      expect(request.url).toBe("/api/v1/reader/feed/profile/9744387?types=note&limit=20");
      response.end(JSON.stringify({ items: [], nextCursor: "next-page" }));
      return;
    }
    expect(request.url).toBe("/api/v1/reader/feed/profile/9744387?types=note&limit=20&cursor=next-page");
    response.end(JSON.stringify({ items: [{ comment: {
      id: 303,
      user_id: 9744387,
      type: "feed",
      ancestor_path: "",
      date: "2020-01-01T00:00:00.000Z",
      body: "paginated approved note",
      attachments: [],
    } }] }));
  });
  closers.push(server.close);
  const { output } = await tempOutput("paginated-note.json");

  const result = await runCli(["--account-origin", server.origin, "note", "export", "--user-id", "9744387", "--note-id", "303", "--output", output]);

  expect(result.code).toBe(0);
  expect(JSON.parse(await readFile(output, "utf8")).posts).toEqual([{
    id: "303",
    text: "paginated approved note",
    images: [],
    publishedAt: "2020-01-01T00:00:00.000Z",
  }]);
});
test("does not stop lookback pagination because one pinned item is old", async () => {
  const now = Date.now();
  const comment = (id: number, date: string, body: string) => ({
    id,
    user_id: 9744387,
    type: "feed",
    ancestor_path: "",
    date,
    body,
    attachments: [],
  });
  let page = 0;
  const server = await withHttpServer((request, response) => {
    page += 1;
    response.setHeader("content-type", "application/json");
    if (page === 1) {
      expect(request.url).toBe("/api/v1/reader/feed/profile/9744387?types=note&limit=20");
      response.end(JSON.stringify({
        items: [
          { comment: comment(401, "2020-01-01T00:00:00.000Z", "old pinned") },
          { comment: comment(402, new Date(now - 60_000).toISOString(), "recent first page") },
        ],
        nextCursor: "next-page",
      }));
      return;
    }
    expect(request.url).toContain("cursor=next-page");
    response.end(JSON.stringify({
      items: [{ comment: comment(403, new Date(now - 120_000).toISOString(), "recent second page") }],
    }));
  });
  closers.push(server.close);
  const { output } = await tempOutput("lookback-pages.json");

  const result = await runCli(["--account-origin", server.origin, "note", "export", "--user-id", "9744387", "--lookback-hours", "4", "--output", output]);

  expect(result.code).toBe(0);
  expect(JSON.parse(await readFile(output, "utf8")).posts.map((post: { id: string }) => post.id)).toEqual(["403", "402"]);
});
