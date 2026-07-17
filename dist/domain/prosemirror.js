export function textToProseMirror(text) {
    const paragraphs = text.split(/\n\n/).map((paragraph) => ({
        type: "paragraph",
        content: paragraph.length ? [{ type: "text", text: paragraph }] : [],
    }));
    return { type: "doc", attrs: { schemaVersion: "v1", title: null }, content: paragraphs };
}
//# sourceMappingURL=prosemirror.js.map