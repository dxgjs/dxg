import { Command } from "commander";
import { registerAddCommand } from "./commands/add";
import { registerDoctorCommand } from "./commands/doctor";
import { shouldShowLogo, showBanner, showLogo } from "./logo";
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

  // Show the logo before a command runs, in interactive terminals only
  // (skipped when piped, in CI and for machine-readable output such as --json).
  program.hook("preAction", (_thisCommand, actionCommand) => {
    const { json } = actionCommand.opts<{ json?: boolean }>();
    if (shouldShowLogo({ json })) showLogo();
  });

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
  // `dxg` alone: show the welcome banner in an interactive terminal. Otherwise
  // fall back to commander's help, which keeps scripts' output and exit code.
  if (process.argv.length <= 2 && shouldShowLogo()) {
    showBanner(pkg.version);
  } else {
    createProgram().parse();
  }
}