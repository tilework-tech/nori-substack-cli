export interface PostListOptions {
    limit?: number;
    offset?: number;
}
export declare class PublicClient {
    getPublication(publicationUrl: string): Promise<unknown>;
    getArchive(publicationUrl: string): Promise<unknown>;
    listPosts(publicationUrl: string, options?: PostListOptions): Promise<unknown>;
    getPost(publicationUrl: string, postId: string): Promise<unknown>;
    getPostBySlug(publicationUrl: string, slug: string): Promise<unknown>;
    getProfileNotes(accountOrigin: string, userId: string, cursor?: string): Promise<unknown>;
    listComments(publicationUrl: string, postId: string, limit?: number): Promise<unknown>;
    getProfile(accountOrigin: string, userId: string, handle: string): Promise<unknown>;
    categories(accountOrigin: string): Promise<unknown>;
    search(accountOrigin: string, query: string): Promise<unknown>;
    lookupLinkedin(accountOrigin: string, handle: string, developerToken?: string): Promise<unknown>;
    getFeed(publicationUrl: string): Promise<unknown>;
}
