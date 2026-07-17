import { Command, CommanderError, Option } from "commander";
import { executeCommand } from "./execute.js";
import { commandFamilies, type OperationSpec, type OptionSpec } from "./specs.js";
import { CliError, normalizeError } from "../core/errors.js";
import { writeError, writeResult, type OutputFormat } from "../core/output.js";

const ROOT_SOURCE = "src/index.ts";
function distance(a: string, b: string): number { const row = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { let previous = row[0]; row[0] = i; for (let j = 1; j <= b.length; j++) { const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = old; } } return row[b.length]; }

function validateTopLevel(argv: string[]): void {
  const input = argv[0];
  if (!input || input.startsWith("-") || commandFamilies.some((family) => family.name === input)) return;
  const match = [...commandFamilies].sort((a, b) => distance(input, a.name) - distance(input, b.name))[0];
  process.stderr.write(`Unknown command '${input}'.\nDid you mean '${match.name}'?\nSource: src/commands/program.ts\n`);
  throw new CliError("UNKNOWN_COMMAND", `Unknown command '${input}'.`, 2, true);
}

function addOption(command: Command, spec: OptionSpec): void {
  const option = new Option(spec.flags, spec.description);
  if (spec.choices) option.choices([...spec.choices]);
  if (spec.defaultValue !== undefined) option.default(spec.defaultValue);
  if (spec.required) option.makeOptionMandatory();
  command.addOption(option);
}

function addOperation(program: Command, family: Command, familyName: string, spec: OperationSpec): void {
  const operation = family.command(spec.name).description(spec.description).addHelpText("after", `\nSource: src/commands/program.ts#${familyName}.${spec.name}\n`);
  for (const option of spec.options ?? []) addOption(operation, option);
  operation.action(async (localOptions: Record<string, unknown>) => {
    try {
      const globals = program.opts() as Record<string, unknown>;
      const result = await executeCommand(familyName, spec.name, localOptions, globals);
      writeResult(`${familyName}.${spec.name}`, result, (globals.format ?? "json") as OutputFormat);
    } catch (error) {
      const normalized = normalizeError(error);
      writeError(normalized, (program.opts().format ?? "json") as OutputFormat);
      process.exitCode = normalized.exitCode;
    }
  });
}

export function createProgram(): Command {
  const program = new Command();
  program.name("nori-substack").version("0.1.0").description("Use this CLI tool to operate Substack.")
    .option("--state <path>", "Path to Playwright storage state.")
    .option("--state-env <name>", "Environment variable containing base64 storage state.", "NORIAGENT_SUBSTACK_STORAGE_B64")
    .option("--account-origin <url>", "Substack account origin.", "https://substack.com")
    .option("--browser <path>", "Chromium executable path for hosted authentication.")
    .option("--developer-token <token>", "Official Substack developer API token.")
    .addOption(new Option("--format <format>", "Output format.").choices(["json", "text"]).default("json"))
    .configureOutput({ getOutHasColors: () => false, getErrHasColors: () => false })
    .exitOverride().addHelpText("after", `\nSource: ${ROOT_SOURCE}\n`);
  for (const familySpec of commandFamilies) {
    const family = program.command(familySpec.name).description(familySpec.description).addHelpText("after", `\nSource: src/commands/program.ts#${familySpec.name}\n`);
    for (const operationSpec of familySpec.operations) addOperation(program, family, familySpec.name, operationSpec);
  }
  return program;
}

export async function run(argv = process.argv.slice(2)): Promise<void> {
  try { validateTopLevel(argv); } catch (error) { if (error instanceof CliError) { process.exitCode = error.exitCode; return; } throw error; }
  const program = createProgram();
  if (!argv.length) { program.outputHelp(); return; }
  try { await program.parseAsync(argv, { from: "user" }); }
  catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") { process.exitCode = 0; return; }
      process.stderr.write(`${error.message.replace(/^error:\s*/i, "")}\nSource: src/commands/program.ts\n`);
      process.exitCode = 2;
      return;
    }
    const normalized = normalizeError(error);
    writeError(normalized, "json");
    process.exitCode = normalized.exitCode;
  }
}
