import { load } from "cheerio";
import type { PublicClient } from "../clients/public.js";
import { CliError } from "../core/errors.js";

interface ArticlePost { title?: unknown; canonical_url?: unknown; cover_image?: unknown; body_html?: unknown }
interface NoteNode { type?: unknown; text?: unknown; attrs?: Record<string, unknown>; content?: NoteNode[] }
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
  const videos: Array<{ id: string; url: string; title?: string }> = [];
  $(".subscription-widget,.subscription-widget-subscribe,.preamble,form,.fake-button,.digest-post-embed,.highlighted_code_block,[data-component-name='AssetErrorToDOM']").remove();
  $("p").each((_index, element) => { const text = $(element).text(); if (/Thanks for reading/.test(text) && /Subscribe/.test(text)) $(element).remove(); });
  // CTA buttons (e.g. event signup) render as <p class="button-wrapper"><a class="button" href>…</a></p>.
  // X Articles have no button element, so preserve real external CTAs as links rather than dropping
  // them with the subscription UI; drop button wrappers that carry no external link.
  $(".button-wrapper").each((_index, element) => {
    const anchor = $(element).find("a[href]").first();
    const href = anchor.attr("href") ?? "";
    const text = anchor.text().replace(/\s+/g, " ").trim();
    if (/^https?:\/\//.test(href) && text) $(element).replaceWith(`<p><a href="${escapeHtml(href)}">${escapeHtml(text)}</a></p>`);
    else $(element).remove();
  });
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
  // Video embeds. X Articles cannot embed external players (the composer's Insert
  // menu has no video/embed option), so preserve each embed as a link rather than
  // dropping it — otherwise the serializer below silently discards these divs.
  const seenVideoIds = new Set<string>();
  $(".youtube-wrap,.embedded-publication-wrap,iframe").each((_index, element) => {
    const node = $(element);
    if (node.closest(".captioned-image-container").length) return;
    const iframeSrc = node.is("iframe") ? node.attr("src") ?? "" : node.find("iframe").attr("src") ?? "";
    const id = youtubeId(iframeSrc);
    if (!id || seenVideoIds.has(id)) return;
    seenVideoIds.add(id);
    const url = `https://www.youtube.com/watch?v=${id}`;
    const marker = `[[NORI_VIDEO:${videos.length}]]`;
    videos.push({ id, url });
    node.replaceWith(`<p>${marker}</p>`);
  });
  const parts: string[] = [];
  const seen = new Set<string>();
  $("p,ul,ol,h1,h2,h3,blockquote").each((_index, element) => {
    const node = $(element);
    if (node.parent().closest("ul,ol,p,blockquote").length && !node.is("ul,ol")) return;
    if (!node.text().trim()) return;
    node.find("*").each((_childIndex, child) => { const childNode = $(child); const href = childNode.is("a") ? childNode.attr("href") : undefined; for (const attr of Object.keys(child.attribs ?? {})) childNode.removeAttr(attr); if (href) childNode.attr("href", href); });
    for (const attr of Object.keys(element.attribs ?? {})) node.removeAttr(attr);
    const serialized = $.html(element);
    const marker = /\[\[NORI_(?:DIVIDER|IMAGE|VIDEO)/.test(node.text());
    if (seen.has(serialized) && !marker) return;
    seen.add(serialized);
    parts.push(serialized);
  });
  let html = parts.join("");
  // Resolve each video marker to a titled link (best-effort title via oEmbed).
  for (let index = 0; index < videos.length; index++) {
    const video = videos[index];
    video.title = await youtubeTitle(video.url);
    const label = escapeHtml(video.title ?? video.url);
    html = html.replace(`[[NORI_VIDEO:${index}]]`, `<a href="${escapeHtml(video.url)}">${label}</a>`);
  }
  return { version: 1, kind: "article", title: stringField(post.title, "title"), canonicalUrl, html, images, videos, ...(typeof post.cover_image === "string" ? { coverUrl: post.cover_image } : {}) };
}

function youtubeId(src: string): string | undefined {
  if (!src) return undefined;
  const match = src.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed|v)\/|youtu\.be\/|[?&]v=)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function youtubeTitle(watchUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return undefined;
    const data = await response.json() as { title?: unknown };
    return typeof data.title === "string" && data.title.trim() ? data.title.trim() : undefined;
  } catch { return undefined; }
}

function inline(nodes: NoteNode[] = []): string { return nodes.map((node) => node.type === "text" ? typeof node.text === "string" ? node.text : "" : /hard_?break/i.test(String(node.type)) ? "\n" : inline(node.content)).join(""); }
// Prefix every line of quoted text with a leading ">" per our quote-syndication convention (blank lines become a bare ">").
function toBlockquote(text: string): string { return text.split("\n").map((line) => line ? `> ${line}` : ">").join("\n"); }
// Substack has used both camelCase ("bulletList") and snake_case ("bullet_list") node names across schema versions.
function isNodeType(node: NoteNode, ...names: string[]): boolean {
  const type = String(node.type ?? "").replace(/_/g, "").toLowerCase();
  return names.some((name) => name.toLowerCase() === type);
}
// X has no list formatting, so a list has to carry its own plain-text markers. Without them every
// item collapses into one run-on line ("entire xai team is firedcursor acquisition ...").
function renderList(node: NoteNode): string {
  const ordered = isNodeType(node, "orderedlist");
  const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;
  return (node.content ?? []).map((item, index) => {
    const marker = ordered ? `${start + index}. ` : "- ";
    // Nested lists hang off the same item, so keep an item's blocks on adjacent lines and indent
    // continuation lines under the marker.
    const [first = "", ...rest] = (item.content ?? []).map(renderBlock).filter(Boolean).join("\n").split("\n");
    return [`${marker}${first}`, ...rest.map((line) => line ? `  ${line}` : line)].join("\n");
  }).join("\n");
}
function renderBlock(node: NoteNode): string {
  if (isNodeType(node, "blockquote")) return (node.content ?? []).map((child) => toBlockquote(inline(child.content))).join("\n\n");
  if (isNodeType(node, "bulletlist", "orderedlist")) return renderList(node);
  return inline(node.content);
}
function renderNote(comment: NoteComment): string {
  const content = comment.body_json?.content;
  if (!Array.isArray(content)) return typeof comment.body === "string" ? comment.body.trim() : "";
  return content.map(renderBlock).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
function attachmentType(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
// A restack ("post" attachment) carries the quoted excerpt in postSelection.text and the canonical link in post.canonical_url.
// The base note body only holds the author's own commentary, so without this the quoted selection and link are dropped.
function renderRestack(attachment: Record<string, unknown>): { quote?: string; url?: string } {
  const selection = attachmentType(attachment.postSelection) && typeof attachment.postSelection.text === "string" ? attachment.postSelection.text.trim() : "";
  const post = attachmentType(attachment.post) ? attachment.post : undefined;
  const url = post && typeof post.canonical_url === "string" && post.canonical_url ? post.canonical_url : "";
  return { ...(selection ? { quote: selection } : {}), ...(url ? { url } : {}) };
}

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
    const restacks = attachments.filter((attachment) => attachment.type === "post").map(renderRestack);
    let text = renderNote(comment);
    for (const restack of restacks) {
      if (restack.quote && !text.includes(restack.quote)) text = text ? `${text}\n\n${toBlockquote(restack.quote)}` : toBlockquote(restack.quote);
      if (restack.url && !text.includes(restack.url)) text = text ? `${text}\n\n${restack.url}` : restack.url;
    }
    for (const url of links) if (!text.includes(url)) text = text ? `${text}\n\n${url}` : url;
    return { id: String(comment.id), text, images, publishedAt: stringField(comment.date, "date") };
  }).sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt));
  if (options.noteId && notes.length === 0) throw new CliError("NOT_FOUND", `Note ${options.noteId} was not found in the public profile feed.`, 8, false);
  return { version: 1, kind: "posts", posts: notes };
}
