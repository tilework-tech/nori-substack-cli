export interface AuthenticatedRequest {
    url: string;
    method?: string;
    body?: unknown;
    globals: Record<string, unknown>;
}
export declare function authenticatedRequest<T = unknown>(request: AuthenticatedRequest): Promise<T>;
export declare function joinSubstackUrl(origin: string, urlPath: string): string;
