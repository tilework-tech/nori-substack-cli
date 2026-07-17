export interface ExecutionResult {
    data: unknown;
    dryRun?: boolean;
}
export declare function executeCommand(family: string, operation: string, options: Record<string, unknown>, globals: Record<string, unknown>): Promise<ExecutionResult>;
