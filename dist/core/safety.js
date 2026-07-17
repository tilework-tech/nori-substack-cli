import { CliError } from "./errors.js";
export function requireConfirmation(confirmed, impact) {
    if (confirmed !== true)
        throw new CliError("CONFIRMATION_REQUIRED", `This operation requires --confirm. ${impact}`, 2, false, { impact });
}
export function describeDryRun(description) { return { data: description, dryRun: true }; }
//# sourceMappingURL=safety.js.map