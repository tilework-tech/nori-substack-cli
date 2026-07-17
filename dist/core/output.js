import { redactSecrets } from "./errors.js";
export function writeResult(command, result, format, stream = process.stdout) {
    const data = command === "auth.export" ? result.data : redactSecrets(result.data);
    const safe = { ok: true, command, dryRun: result.dryRun ?? false, alreadyCompleted: result.alreadyCompleted ?? false, data };
    stream.write(format === "json" ? `${JSON.stringify(safe)}\n` : `${command}: ${JSON.stringify(safe.data)}\n`);
}
export function writeError(error, format, stream = process.stderr) {
    const details = redactSecrets(error.details);
    const serialized = { code: error.code, message: redactSecrets(error.message), retrySafe: error.retrySafe, ...details };
    stream.write(format === "json" ? `${JSON.stringify({ ok: false, error: serialized })}\n` : `${error.code}: ${serialized.message}\n`);
}
//# sourceMappingURL=output.js.map