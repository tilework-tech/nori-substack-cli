import { afterEach, expect, test } from "vitest";
import { runCli, withHttpServer } from "./helpers.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()?.(); });

test("parses a realistic public publication RSS feed without authentication", async () => {
  let requests = 0;
  const server = await withHttpServer((request, response) => {
    requests += 1;
    expect(request.url).toBe("/feed");
    expect(request.headers.cookie).toBeUndefined();
    response.setHeader("content-type", "application/rss+xml; charset=utf-8");
    response.end(`<?xml version="1.0"?><rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Carbon</title><link>https://carbon.example</link><description>Climate writing</description><item><guid>post-1</guid><title>First</title><link>https://carbon.example/p/first</link><pubDate>Wed, 01 Jan 2025 12:00:00 GMT</pubDate><description><![CDATA[<p>Hello</p>]]></description><content:encoded><![CDATA[<p>Full hello</p>]]></content:encoded></item><item><guid>post-2</guid><title>Second</title><link>https://carbon.example/p/second</link><description>Summary only</description></item></channel></rss>`);
  });
  closers.push(server.close);
  const result = await runCli(["publication", "feed", "--url", server.origin]);
  expect(result.code).toBe(0);
  expect(requests).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, command: "publication.feed", data: {
    title: "Carbon", description: "Climate writing", items: [
      { id: "post-1", title: "First", url: "https://carbon.example/p/first", content: "<p>Full hello</p>" },
      { id: "post-2", title: "Second", url: "https://carbon.example/p/second", description: "Summary only" },
    ],
  } });
});

test("gets a public post by id", async () => {
  const server = await withHttpServer((request, response) => {
    expect(request.url).toBe("/api/v1/posts/by-id/7");
    expect(request.headers.cookie).toBeUndefined();
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ post: { id: 7, title: "Public" } }));
  });
  closers.push(server.close);
  const result = await runCli(["post", "get", "--publication-url", server.origin, "--post-id", "7"]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout).data.post.title).toBe("Public");
});

test("does not expose the LinkedIn profile lookup or its developer token", async () => {
  const topLevel = await runCli(["--help"]);
  expect(topLevel.stdout).not.toMatch(/developer-token/);

  const profileHelp = await runCli(["profile", "--help"]);
  expect(profileHelp.code).toBe(0);
  expect(profileHelp.stdout).toMatch(/\bget\b/);
  expect(profileHelp.stdout).not.toMatch(/linkedin/i);

  const invoked = await runCli(["profile", "linkedin", "--handle", "alice"]);
  expect(invoked.code).not.toBe(0);
});
