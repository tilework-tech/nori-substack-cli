export interface ProseMirrorNode {
    type: string;
    attrs?: Record<string, unknown>;
    text?: string;
    content?: ProseMirrorNode[];
}
export declare function textToProseMirror(text: string): ProseMirrorNode;
