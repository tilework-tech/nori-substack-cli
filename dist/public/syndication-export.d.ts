import type { PublicClient } from "../clients/public.js";
export interface RestackedItem {
    kind: "note" | "post";
    id: string;
    author: {
        name: string | null;
        handle: string | null;
    };
    title?: string;
    text: string;
    url: string | null;
}
export declare function exportPostArtifact(client: PublicClient, postUrl: string): Promise<unknown>;
export declare function exportNotesArtifact(client: PublicClient, options: {
    accountOrigin: string;
    userId: string;
    lookbackHours: number;
    noteId?: string;
    includeRestacks?: boolean;
    now?: Date;
}): Promise<unknown>;
