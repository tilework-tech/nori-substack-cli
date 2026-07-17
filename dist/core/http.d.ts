export interface JsonGetOptions {
    query?: ReadonlyArray<readonly [string, string | number | undefined]>;
}
export declare function getJson(input: string | URL, options?: JsonGetOptions): Promise<unknown>;
