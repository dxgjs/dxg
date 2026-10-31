import { Command } from "commander";
import { registerAddCommand } from "./commands/add";
import { registerDoctorCommand } from "./commands/doctor";
import pkg from "../package.json" with { type: "json" };

/**
 * Builds the DXG CLI program: root metadata and subcommands.
 * No default action - root command without subcommand shows help/error.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("dxg")
    .description("DXG CLI for generating project scaffolding")
    .version(pkg.version, "-v, --version")
    .option(
      "--non-interactive",
      "Do not prompt for input; fail if required values are missing",
    )
    .option("--dry-run", "Perform a dry run without making any changes")
    .option("--force", "Force overwrite of conflicting files");

  // Add command - adds a specific generator
  registerAddCommand(program);

  // Doctor command - diagnose and repair project configuration
  registerDoctorCommand(program);

  return program;
}

// Entry point: the bin imports dist/index.js for its side effect only, so
// parsing must happen at module load — except under Vitest, where tests
// import createProgram() and drive parsing with their own argv.
if (!process.env.VITEST) {
  const program = createProgram();
  program.parse();
}