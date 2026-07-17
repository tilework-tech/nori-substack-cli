export declare function browserEnvironment(): NodeJS.ProcessEnv;
export declare function discoverChromium(explicit?: string): Promise<string>;
export declare function captureFromCdp(cdp: string, statePath: string): Promise<{
    statePath: string;
    cookieCount: number;
    sessionCookieCount: number;
}>;
