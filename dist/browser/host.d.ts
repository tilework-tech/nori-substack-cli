export interface VncStackPlan {
    useProot: boolean;
    vncBin: string;
    novncWeb: string;
    websockify: string[];
    vncRoot: string;
}
export declare function resolveVncStack(xvfbExists: boolean, home: string, vncRoot?: string): VncStackPlan;
export declare function buildNovncUrl(sessionBaseUrl: string, novncPort: number): string;
export interface HostOptions {
    stop?: boolean;
    sessionUrl?: string;
    browser?: string;
}
export declare function hostBrowser(options: HostOptions): Promise<unknown>;
