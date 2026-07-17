import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PublicClient } from "../clients/public.js";
import { CliError } from "../core/errors.js";
import { exportNotesArtifact, exportPostArtifact } from "../public/syndication-export.js";
const stringOption = (options, name) => { const value = options[name]; if (typeof value !== "string" || !value)
    throw new CliError("INVALID_ARGUMENT", `--${name} is required.`, 2); return value; };
const numberOption = (options, name) => { if (options[name] === undefined)
    return undefined; const value = Number(options[name]); if (!Number.isFinite(value))
    throw new CliError("INVALID_ARGUMENT", `--${name} must be numeric.`, 2); return value; };
const optionalString = (options, name) => typeof options[name] === "string" && options[name] ? options[name] : undefined;
async function writeJson(output, value) { const destination = path.resolve(output); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
export async function executePublicCommand(family, operation, options, globals) {
    const client = new PublicClient();
    const accountOrigin = typeof globals.accountOrigin === "string" ? globals.accountOrigin : "https://substack.com";
    if (family === "publication" && operation === "get")
        return { data: await client.getPublication(stringOption(options, "url")) };
    if (family === "publication" && operation === "feed")
        return { data: await client.getFeed(stringOption(options, "url")) };
    if (family === "publication" && operation === "archive")
        return { data: await client.getArchive(stringOption(options, "publicationUrl")) };
    if (family === "post" && operation === "list")
        return { data: await client.listPosts(stringOption(options, "publicationUrl"), { limit: numberOption(options, "limit"), offset: numberOption(options, "offset") }) };
    if (family === "post" && operation === "get")
        return { data: await client.getPost(stringOption(options, "publicationUrl"), stringOption(options, "postId")) };
    if (family === "post" && operation === "export") {
        const artifact = await exportPostArtifact(client, stringOption(options, "url"));
        await writeJson(stringOption(options, "output"), artifact);
        return { data: artifact };
    }
    if (family === "note" && operation === "export") {
        const lookbackHours = numberOption(options, "lookbackHours") ?? 4;
        if (lookbackHours < 0)
            throw new CliError("INVALID_ARGUMENT", "--lookback-hours must be a non-negative number.", 2);
        const artifact = await exportNotesArtifact(client, { accountOrigin, userId: stringOption(options, "userId"), lookbackHours, noteId: optionalString(options, "noteId") });
        await writeJson(stringOption(options, "output"), artifact);
        return { data: artifact };
    }
    if (family === "comment" && operation === "list")
        return { data: await client.listComments(stringOption(options, "publicationUrl"), stringOption(options, "postId"), numberOption(options, "limit")) };
    if (family === "profile" && operation === "get")
        return { data: await client.getProfile(accountOrigin, stringOption(options, "userId"), stringOption(options, "handle")) };
    if (family === "discover" && operation === "categories")
        return { data: await client.categories(accountOrigin) };
    if (family === "discover" && operation === "search")
        return { data: await client.search(accountOrigin, stringOption(options, "query")) };
    if (family === "profile" && operation === "linkedin") {
        const token = typeof globals.developerToken === "string" ? globals.developerToken : process.env.SUBSTACK_DEVELOPER_TOKEN;
        return { data: await client.lookupLinkedin(accountOrigin, stringOption(options, "handle"), token) };
    }
    throw new CliError("UNSUPPORTED_COMMAND", `Unsupported public command: ${family} ${operation}.`, 2, false, { family, operation });
}
//# sourceMappingURL=execute-public.js.map