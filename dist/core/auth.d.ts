export interface StorageStateCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
}
export interface PlaywrightStorageState {
    cookies: StorageStateCookie[];
    origins: Array<{
        origin: string;
        localStorage: Array<{
            name: string;
            value: string;
        }>;
    }>;
}
export declare function parseStorageState(value: string): PlaywrightStorageState;
export declare function decodeStorageStateBase64(value: string): {
    state: PlaywrightStorageState;
    json: string;
};
export declare function readStorageState(statePath: string): Promise<{
    state: PlaywrightStorageState;
    json: string;
}>;
export declare function writeStorageState(statePath: string, json: string): Promise<PlaywrightStorageState>;
export declare function resolveStateEnvValue(stateEnv: unknown): string | undefined;
export declare function resolveStorageState(globals: Record<string, unknown>): Promise<PlaywrightStorageState>;
export declare function sessionCookies(state: PlaywrightStorageState): StorageStateCookie[];
export declare function cookieHeader(state: PlaywrightStorageState): string;
export declare function redactSecrets(value: string, state: PlaywrightStorageState): string;
