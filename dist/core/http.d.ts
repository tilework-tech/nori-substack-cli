export interface JsonGetOptions {
    query?: ReadonlyArray<readonly [string, string | number | undefined]>;
}
export declare function isCloudflareChallenge(response: Response): boolean;
export declare function publicGet(url: string | URL, headers: Record<string, string>): Promise<Response>;
export declare function getJson(input: string | URL, options?: JsonGetOptions): Promise<unknown>;
