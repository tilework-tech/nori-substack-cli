import { executeAuthCommand } from "./execute-auth.js";
import { executePublicCommand } from "./execute-public.js";
import { executeVerifiedCommand } from "./execute-verified.js";

export interface ExecutionResult { data: unknown; dryRun?: boolean }

export async function executeCommand(family: string, operation: string, options: Record<string, unknown>, globals: Record<string, unknown>): Promise<ExecutionResult> {
  const publicOperation = (family === "publication" && ["get", "feed", "archive"].includes(operation))
    || (family === "post" && ["list", "get"].includes(operation))
    || (family === "profile" && ["get", "linkedin"].includes(operation))
    || (family === "comment" && operation === "list")
    || family === "discover";
  if (publicOperation) return executePublicCommand(family, operation, options, globals);

  const coreAuthOperation = family === "auth"
    || (family === "profile" && operation === "me")
    || (family === "post" && ["delete", "publish"].includes(operation));
  if (coreAuthOperation) return executeAuthCommand(family, operation, options, globals);

  return executeVerifiedCommand(family, operation, options, globals);
}
