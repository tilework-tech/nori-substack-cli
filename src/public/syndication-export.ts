import { load } from "cheerio";
import type { PublicClient } from "../clients/public.js";
import { CliError } from "../core/errors.js";

interface ArticlePost { title?: unknown; canonical_url?: unknown; cover_image?: unknown; body_html?: unknown }
interface NoteNode { type?: unknown; text?: unknown; content?: NoteNode[] }
interface NoteComment { id?: unknown; user_id?: unknown; type?: unknown; ancestor_path?: unknown; date?: unknown; body?: unknown; body_json?: { content?: NoteNode[] }; attachments?: unknown[] }

function stringField(value: unknown, name: string): string {
  if (typeof value !== "string") throw new CliError("INVALID_RESPONSE", `Substack post did not contain ${name}.`, 8);
  return value;
}

export async function exportPostArtifact(client: PublicClient, postUrl: string): Promise<unknown> {
  let parsed: URL;
  try { parsed = new URL(postUrl); } catch { throw new CliError("INVALID_ARGUMENT", "--url must be a valid URL.", 2); }
  const match = parsed.pathname.match(/^\/p\/([^/]+)/);
  if (!match) throw new CliError("INVALID_ARGUMENT", "--url must contain /p/<slug>.", 2);
  const post = await client.getPostBySlug(parsed.origin, decodeURIComponent(match[1])) as ArticlePost;
  const canonicalUrl = typeof post.canonical_url === "string" ? post.canonical_url : postUrl;
  const $ = load(stringField(post.body_html, "body_html"), { xmlMode: false });
  const images: Array<{ url: string; caption: string }> = [];
  $(".subscription-widget,.subscription-widget-subscribe,.preamble,form,.fake-button,.button-wrapper,.digest-post-embed,.highlighted_code_block,[data-component-name='AssetErrorToDOM']").remove();
  $("p").each((_index, element) => { const text = $(element).text(); if (/Thanks for reading/.test(text) && /Subscribe/.test(text)) $(element).remove(); });
  $("div > hr").each((_index, element) => { const parent = $(element).parent(); if (parent.is("div") && parent.children().length === 1) parent.replaceWith("<p>[[NORI_DIVIDER]]</p>"); });
  $("a.footnote-anchor").each((_index, element) => { $(element).replaceWith(`[${$(element).text().trim()}]`); });
  $("div.footnote").each((_index, element) => { const number = $(element).find(".footnote-number").text().trim(); const body = $(element).find(".footnote-content").text().trim().replace(/\s+/g, " "); $(element).replaceWith(`<p>[${number}] ${body}</p>`); });
  $(".captioned-image-container").each((_index, element) => {
    const url = $(element).find("img").first().attr("src") ?? "";
    if (!url || url.includes("missing-image")) { $(element).remove(); return; }
    const caption = $(element).find("figcaption,.image-caption").first().text().trim();
    const marker = `[[NORI_IMAGE:${images.length}]]`;
    images.push({ url, caption });
    $(element).replaceWith(`<p>${marker}</p>${caption ? `<p><em>${caption}</em></p>` : ""}`);
  });
  const parts: string[] = [];
  $("p,ul,ol,h1,h2,h3,blockquote").each((_index, element) => {
    const node = $(element);
    if (node.parent().closest("ul,ol,p,blockquote").length) return;
    if (!node.text().trim()) return;
    node.find("*").each((_childIndex, child) => { const childNode = $(child); const href = childNode.is("a") ? childNode.attr("href") : undefined; for (const attr of Object.keys(child.attribs ?? {})) childNode.removeAttr(attr); if (href) childNode.attr("href", href); });
    for (const attr of Object.keys(element.attribs ?? {})) node.removeAttr(attr);
    const serialized = $.html(element);
    parts.push(serialized);
  });
  return { version: 1, kind: "article", title: stringField(post.title, "title"), canonicalUrl, html: parts.join(""), images, ...(typeof post.cover_image === "string" ? { coverUrl: post.cover_image } : {}) };
}

function inline(nodes: NoteNode[] = []): string { return nodes.map((node) => node.type === "text" ? typeof node.text === "string" ? node.text : "" : /hard_?break/i.test(String(node.type)) ? "\n" : inline(node.content)).join(""); }
function renderNote(comment: NoteComment): string {
  const content = comment.body_json?.content;
  if (!Array.isArray(content)) return typeof comment.body === "string" ? comment.body.trim() : "";
  return content.map((node) => node.type !== "blockquote" ? inline(node.content) : (node.content ?? []).map((child) => inline(child.content).split("\n").map((line) => line ? `> ${line}` : ">").join("\n")).join("\n\n")).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
function attachmentType(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export async function exportNotesArtifact(client: PublicClient, options: { accountOrigin: string; userId: string; lookbackHours: number; noteId?: string; now?: Date }): Promise<unknown> {
  const cutoff = (options.now ?? new Date()).getTime() - options.lookbackHours * 3_600_000;
  const items: Array<{ comment?: NoteComment }> = [];
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const page = await client.getProfileNotes(options.accountOrigin, options.userId, cursor) as { items?: Array<{ comment?: NoteComment }>; nextCursor?: string };
    const pageItems = page.items ?? [];
    items.push(...pageItems);
    const comments = pageItems.flatMap((item) => item.comment ? [item.comment] : []);
    if (options.noteId && comments.some((comment) => String(comment.id) === options.noteId)) break;
    const timestamps = comments.map((comment) => typeof comment.date === "string" ? Date.parse(comment.date) : Number.NaN).filter(Number.isFinite);
    if (!options.noteId && timestamps.length > 0 && timestamps.every((timestamp) => timestamp < cutoff)) break;
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  const notes = items.flatMap((item) => item.comment ? [item.comment] : []).filter((comment) => {
    if (String(comment.user_id) !== options.userId || comment.type !== "feed" || Boolean(comment.ancestor_path)) return false;
    if (options.noteId) return String(comment.id) === options.noteId;
    const published = typeof comment.date === "string" ? Date.parse(comment.date) : Number.NaN;
    return Number.isFinite(published) && published >= cutoff;
  }).map((comment) => {
    const attachments = (comment.attachments ?? []).filter(attachmentType);
    const images = attachments.filter((attachment) => attachment.type === "image" && typeof attachment.imageUrl === "string").map((attachment) => attachment.imageUrl as string);
    const links = attachments.filter((attachment) => attachment.type === "link" && attachmentType(attachment.linkMetadata) && typeof attachment.linkMetadata.url === "string").map((attachment) => (attachment.linkMetadata as Record<string, unknown>).url as string);
    let text = renderNote(comment);
    for (const url of links) if (!text.includes(url)) text = text ? `${text}\n\n${url}` : url;
    return { id: String(comment.id), text, images, publishedAt: stringField(comment.date, "date") };
  }).sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt));
  if (options.noteId && notes.length === 0) throw new CliError("NOT_FOUND", `Note ${options.noteId} was not found in the public profile feed.`, 8, false);
  return { version: 1, kind: "posts", posts: notes };
}
