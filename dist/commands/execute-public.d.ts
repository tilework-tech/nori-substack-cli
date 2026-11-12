type Result = {
    data: unknown;
    dryRun?: boolean;
    pagination?: {
        nextCursor: string | null;
    };
};
export declare function executePublicCommand(family: string, operation: string, options: Record<string, unknown>, globals: Record<string, unknown>): Promise<Result>;
export {};
