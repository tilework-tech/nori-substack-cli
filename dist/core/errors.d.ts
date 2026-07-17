export declare function redactSecrets(value: unknown): unknown;
export declare class CliError extends Error {
    readonly code: string;
    readonly exitCode: number;
    readonly retrySafe: boolean;
    readonly details: Record<string, unknown>;
    constructor(code: string, message: string, exitCode?: number, retrySafe?: boolean, details?: Record<string, unknown>);
}
export declare function normalizeError(error: unknown): CliError;
