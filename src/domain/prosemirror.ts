export interface ProseMirrorNode { type: string; attrs?: Record<string, unknown>; text?: string; content?: ProseMirrorNode[] }

export function textToProseMirror(text: string): ProseMirrorNode {
  const paragraphs = text.split(/\n\n/).map((paragraph) => ({
    type: "paragraph",
    content: paragraph.length ? [{ type: "text", text: paragraph }] : [],
  }));
  return { type: "doc", attrs: { schemaVersion: "v1", title: null }, content: paragraphs };
}
