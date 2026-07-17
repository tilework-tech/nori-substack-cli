import { executeAuthCommand } from "./execute-auth.js";
import { executePublicCommand } from "./execute-public.js";
import { executeVerifiedCommand } from "./execute-verified.js";
export async function executeCommand(family, operation, options, globals) {
    const publicOperation = (family === "publication" && ["get", "feed", "archive"].includes(operation))
        || (family === "post" && ["list", "get", "export"].includes(operation))
        || (family === "note" && operation === "export")
        || (family === "profile" && ["get", "linkedin"].includes(operation))
        || (family === "comment" && operation === "list")
        || family === "discover";
    if (publicOperation)
        return executePublicCommand(family, operation, options, globals);
    const coreAuthOperation = family === "auth"
        || (family === "profile" && operation === "me")
        || (family === "post" && ["delete", "publish"].includes(operation));
    if (coreAuthOperation)
        return executeAuthCommand(family, operation, options, globals);
    return executeVerifiedCommand(family, operation, options, globals);
}
//# sourceMappingURL=execute.js.map