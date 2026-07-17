type Options = Record<string, unknown>;
type Globals = Record<string, unknown>;
type Result = {
    data: unknown;
    dryRun?: boolean;
};
export declare function executeMediaCommand(operation: string, options: Options, globals: Globals): Promise<Result>;
export {};
