import type { Command } from "commander";
import {
  registerAllChecks,
  runDoctor,
  applyFixes,
  determineExitCode,
  showIntro,
  showOutro,
  renderReport,
  renderJson,
  validateDoctorOptions,
  showFixPreview,
  type DoctorCliOptions,
  type DoctorContext,
} from "@dxgjs/doctor";
import { detectProjectAwarenessSilently, prepareContext, runInTargetDirectory, type CommanderOptions } from "../generator-run";
import type { FSInterface } from "@dxgjs/doctor";
import { executeCommand } from "@dxgjs/fs";

/**
 * Registers the `doctor` command — runs diagnostic checks on the project.
 */
export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Diagnose and repair DXG project configuration")
    .option(
      "-c, --category <categories>",
      "Comma-separated list of categories to check (env, project, database, scripts)",
    )
    .option("--json", "Output results as JSON")
    .option("--fix", "Attempt to automatically fix issues")
    .option("-y, --yes", "Skip confirmation prompts for fixes")
    .option("--dry-run", "Show what would be fixed without applying")
    .option("--check-only", "Exit with code 1 if any issues found (for CI)")
    .option("--non-interactive", "Do not prompt for input; fail if required values are missing")
    .option("--force", "Force overwrite of conflicting files")
    .addHelpText("after", `
Examples:
  $ dxg doctor                          # Run all checks
  $ dxg doctor --category env,project   # Run only env and project checks
  $ dxg doctor --fix                    # Run all checks and fix issues
  $ dxg doctor --check-only             # CI-friendly: exit 1 on any issue
  $ dxg doctor --json                   # Machine-readable output
`)
    .action(async (_options, cmd) => {
      // Merge local options with root's global options
      const mergedOptions = cmd.optsWithGlobals() as CommanderOptions & {
        category?: string;
        json?: boolean;
        fix?: boolean;
        yes?: boolean;
        dryRun?: boolean;
        checkOnly?: boolean;
      };

      try {
        const targetDir = process.cwd();

        // Detect project awareness first to get workspace root
        // The generator uses this to properly detect monorepo root
        const awareness = await detectProjectAwarenessSilently(targetDir);
        const projectRoot = awareness.workspaceRoot;

        // Register all checks
        await registerAllChecks();

        // Validate and normalize CLI options
        const doctorOptions = validateDoctorOptions(mergedOptions, {
          nonInteractive: mergedOptions.nonInteractive,
          dryRun: mergedOptions.dryRun,
          force: mergedOptions.force,
        });

        // Parse category string if provided
        if (mergedOptions.category) {
          doctorOptions.category = mergedOptions.category
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c.length > 0) as DoctorCliOptions["category"];
        }

        // Build context
        const context = await prepareContext(mergedOptions, awareness);
        // Add executeCommand only for doctor context (not exposed to generators)
        const doctorFs: FSInterface = {
          ...context.fs,
          executeCommand: async (command: string, args?: string[], options?: Record<string, unknown>) => {
            const result = await executeCommand(command, args, options as any);
            return { stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? ""), exitCode: result.exitCode ?? 0 };
          },
        } as FSInterface;
        const doctorContext: DoctorContext = {
          cwd: projectRoot,
          packageJson: awareness.packageJson,
          awareness,
          fs: doctorFs,
          logger: context.logger,
          templates: context.templates,
          options: doctorOptions,
        };

        // Run doctor
        if (!doctorOptions.json) {
          showIntro();
        }

        const report = await runInTargetDirectory(projectRoot, async () => {
          return runDoctor(doctorContext);
        });

        // Render results
        if (doctorOptions.json) {
          renderJson(report);
        } else {
          renderReport(report);
        }

        // Apply fixes if requested
        if (doctorOptions.fix && report.hasFixes) {
          if (!doctorOptions.dryRun) {
            if (!doctorOptions.yes && !doctorOptions.nonInteractive) {
              const { confirm } = await import("@dxgjs/prompts");
              const confirmed = await confirm({
                message: `Apply ${report.summary.fixable} fix${report.summary.fixable === 1 ? "" : "es"}?`,
                initialValue: true,
              });
              if (!confirmed) {
                if (!doctorOptions.json) {
                  showOutro(report, { fix: true, dryRun: false });
                }
                process.exitCode = determineExitCode(report, { checkOnly: doctorOptions.checkOnly, json: doctorOptions.json });
                return;
              }
            }
          }

          const applied = await runInTargetDirectory(projectRoot, async () => {
            return applyFixes(report, doctorContext);
          });

          if (!doctorOptions.json) {
            // Dry-run shows "Would apply", actual fix shows "applied"
            const fixMessages = Array.from({ length: applied }, (_, i) =>
              doctorOptions.dryRun ? `Would apply fix ${i + 1}` : `Fix ${i + 1} applied`
            );
            showFixPreview(fixMessages);
          }
        }

        // Show outro
        if (!doctorOptions.json) {
          showOutro(report, {
            fix: doctorOptions.fix,
            dryRun: doctorOptions.dryRun,
            checkOnly: doctorOptions.checkOnly,
          });
        }

        // Determine exit code
        process.exitCode = determineExitCode(report, {
          checkOnly: doctorOptions.checkOnly,
          json: doctorOptions.json,
        });
      } catch (err) {
        const { formatError } = await import("@dxgjs/errors");
        console.error(formatError(err));
        process.exitCode = 2; // INVALID_USAGE
      }
    });
}