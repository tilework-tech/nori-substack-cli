import { type CliError, redactSecrets } from "./errors.js";

export type OutputFormat = "json" | "text";
export interface CommandResult { data: unknown; dryRun?: boolean; alreadyCompleted?: boolean }

export function writeResult(command: string, result: CommandResult, format: OutputFormat, stream: NodeJS.WritableStream = process.stdout): void {
  const data = command === "auth.export" ? result.data : redactSecrets(result.data);
  const safe = { ok: true, command, dryRun: result.dryRun ?? false, alreadyCompleted: result.alreadyCompleted ?? false, data };
  stream.write(format === "json" ? `${JSON.stringify(safe)}\n` : `${command}: ${JSON.stringify(safe.data)}\n`);
}

export function writeError(error: CliError, format: OutputFormat, stream: NodeJS.WritableStream = process.stderr): void {
  const details = redactSecrets(error.details) as Record<string, unknown>;
  const serialized = { code: error.code, message: redactSecrets(error.message), retrySafe: error.retrySafe, ...details };
  stream.write(format === "json" ? `${JSON.stringify({ ok: false, error: serialized })}\n` : `${error.code}: ${serialized.message}\n`);
}
