import type { PublicClient } from "../clients/public.js";
export declare function exportPostArtifact(client: PublicClient, postUrl: string): Promise<unknown>;
export declare function exportNotesArtifact(client: PublicClient, options: {
    accountOrigin: string;
    userId: string;
    lookbackHours: number;
    noteId?: string;
    now?: Date;
}): Promise<unknown>;
