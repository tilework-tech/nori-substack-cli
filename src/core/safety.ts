import { CliError } from "./errors.js";

export function requireConfirmation(confirmed: unknown, impact: string): void {
  if (confirmed !== true) throw new CliError("CONFIRMATION_REQUIRED", `This operation requires --confirm. ${impact}`, 2, false, { impact });
}
export interface DryRunDescription { method: string; url: string; body?: unknown; impact: string }
export function describeDryRun(description: DryRunDescription): { data: DryRunDescription; dryRun: true } { return { data: description, dryRun: true }; }
