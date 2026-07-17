type Options = Record<string, unknown>;
type Globals = Record<string, unknown>;
export declare function executeAuthCommand(family: string, operation: string, options: Options, globals: Globals): Promise<{
    data: unknown;
    dryRun?: boolean;
}>;
export {};
