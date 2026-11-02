/**
 * Main entry point for @dxgjs/doctor package.
 * Exports all public APIs for the doctor command.
 */

// Types
export * from "./types";

// Registry
export {
  registerCheck,
  getCheck,
  getChecksByCategory,
  getAllChecks,
  getDefaultChecks,
  clearRegistry,
  runCheck,
} from "./registry";

// Runner
export {
  runDoctor,
  applyFixes,
  determineExitCode,
  runCategoryChecks,
} from "./runner";

// Renderers
export {
  showIntro,
  showOutro,
  renderCheckResult,
  renderReport,
  renderJson,
  withSpinner,
  showFixPreview,
  confirmFixes,
  formatCheckId,
} from "./renderers";

// Flags
export {
  validateDoctorOptions,
  validateKnownFlags,
  mapExitCode,
} from "./flags";

// Check registration functions (called by CLI to register checks)
export { registerEnvChecks } from "./checks/env";
export { registerProjectChecks } from "./checks/project";
export { registerDatabaseChecks } from "./checks/database";
export { registerScriptsChecks } from "./checks/scripts";

/**
 * Register all default checks.
 * Call this once at CLI startup to populate the registry.
 */
export async function registerAllChecks(): Promise<void> {
  const { clearRegistry } = await import("./registry");
  clearRegistry();

  // Import and call registration functions for each check category
  const { registerEnvChecks } = await import("./checks/env");
  const { registerProjectChecks } = await import("./checks/project");
  const { registerDatabaseChecks } = await import("./checks/database");
  const { registerScriptsChecks } = await import("./checks/scripts");

  await registerEnvChecks();
  await registerProjectChecks();
  await registerDatabaseChecks();
  await registerScriptsChecks();
}