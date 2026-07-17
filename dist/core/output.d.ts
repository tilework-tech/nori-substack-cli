import { type CliError } from "./errors.js";
export type OutputFormat = "json" | "text";
export interface CommandResult {
    data: unknown;
    dryRun?: boolean;
    alreadyCompleted?: boolean;
}
export declare function writeResult(command: string, result: CommandResult, format: OutputFormat, stream?: NodeJS.WritableStream): void;
export declare function writeError(error: CliError, format: OutputFormat, stream?: NodeJS.WritableStream): void;
