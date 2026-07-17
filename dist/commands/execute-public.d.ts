type Result = {
    data: unknown;
    dryRun?: boolean;
};
export declare function executePublicCommand(family: string, operation: string, options: Record<string, unknown>, globals: Record<string, unknown>): Promise<Result>;
export {};
