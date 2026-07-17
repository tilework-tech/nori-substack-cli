const sensitiveKey = /^(authorization|cookie|cookies|password|secret|token|base64|storage.?state|session|sessionid)$/i;
function redactString(value) {
    return value
        .replace(/\bBearer\s+[^\s"',}]+/gi, "Bearer [REDACTED]")
        .replace(/\b(connect\.sid|substack\.sid|session(?:id)?)=([^;\s]+)/gi, "$1=[REDACTED]");
}
export function redactSecrets(value) {
    if (typeof value === "string")
        return redactString(value);
    if (Array.isArray(value))
        return value.map(redactSecrets);
    if (value && typeof value === "object") {
        const redacted = {};
        for (const [key, nested] of Object.entries(value))
            redacted[key] = sensitiveKey.test(key) ? "[REDACTED]" : redactSecrets(nested);
        return redacted;
    }
    return value;
}
export class CliError extends Error {
    code;
    exitCode;
    retrySafe;
    details;
    constructor(code, message, exitCode = 1, retrySafe = false, details = {}) {
        super(message);
        this.code = code;
        this.exitCode = exitCode;
        this.retrySafe = retrySafe;
        this.details = details;
        this.name = "CliError";
    }
}
export function normalizeError(error) {
    if (error instanceof CliError)
        return error;
    return new CliError("UNEXPECTED_ERROR", error instanceof Error ? redactString(error.message) : "An unexpected error occurred.", 1, false);
}
//# sourceMappingURL=errors.js.map