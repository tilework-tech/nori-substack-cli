const sensitiveKey = /^(authorization|cookie|cookies|password|secret|token|base64|storage.?state|session|sessionid)$/i;

function redactString(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"',}]+/gi, "Bearer [REDACTED]")
    .replace(/\b(connect\.sid|substack\.sid|session(?:id)?)=([^;\s]+)/gi, "$1=[REDACTED]");
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) redacted[key] = sensitiveKey.test(key) ? "[REDACTED]" : redactSecrets(nested);
    return redacted;
  }
  return value;
}

export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode = 1,
    public readonly retrySafe = false,
    public readonly details: Record<string, unknown> = {},
  ) { super(message); this.name = "CliError"; }
}

export function normalizeError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  return new CliError("UNEXPECTED_ERROR", error instanceof Error ? redactString(error.message) : "An unexpected error occurred.", 1, false);
}
