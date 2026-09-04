/**
 * Internal dependency-installation module of @dxgjs/generators.
 *
 * Exposed through the package root (src/index.ts) so the CLI can build the
 * installer in prepareContext and generators receive it on their context —
 * but this is NOT a generic public framework: it is the generators'
 * install engine, domain-local by design.
 */

export type {
  DependencySpec,
  DependencyPlan,
  PackageManagerName,
  PackageManagerAgent,
  DependencyInstallFailureReason,
  DependencyInstallResult,
  DependencyArtifactVerifier,
  DependencyInstaller,
  DependencyInstallOptions,
} from "./types";

export {
  createDependencyInstaller,
  detectPackageManagerAgent,
  installerFailureHint,
  approvalPaths,
} from "./installer";

export {
  packageNameFromSpec,
  classifyInstallFailure,
  scanBlockedBuilds,
  isPnpmIgnoredBuilds,
  parsePnpmIgnoredBuilds,
  isNpmInstallScriptsWarning,
  parseNpmBlockedScripts,
  isBunBlockedPostinstall,
  isYarnDisabledBuildScripts,
  isPackageNotFound,
  isNativeBuildFailed,
} from "./classify";

export {
  applyPnpmAllowBuilds,
  mergeAllowBuildsBlock,
  applyNpmAllowScripts,
  applyYarnBerryDependenciesMeta,
} from "./approvals";
