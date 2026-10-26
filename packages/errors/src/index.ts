/**
 * DXG Error Hierarchy
 *
 * Provides typed, structured errors with recovery hints and machine-readable output.
 * All DXG errors should inherit from DXGError.
 */

export type RecoveryAction =
  | "retry"
  | "reconfigure"
  | "manual-intervention"
  | "abort";

export interface DXGErrorOptions {
  recoverable?: boolean;
  hints?: string[];
  docsUrl?: string;
  recoveryAction?: RecoveryAction;
  cause?: Error;
}

/**
 * Base DXGError class with structured error information.
 */
export class DXGError extends Error {
  public readonly code: string;
  public readonly recoverable: boolean;
  public readonly hints: string[];
  public readonly docsUrl: string;
  public readonly recoveryAction: RecoveryAction;
  public readonly cause?: Error;

  constructor(code: string, message: string, options: DXGErrorOptions = {}) {
    super(message);
    this.name = "DXGError";
    this.code = code;
    this.recoverable = options.recoverable ?? false;
    this.hints = options.hints ?? [];
    this.docsUrl = options.docsUrl ?? "";
    this.recoveryAction = options.recoveryAction ?? "abort";
    this.cause = options.cause;

    // Maintains proper stack trace (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DXGError);
    }
  }

  /**
   * Serializes the error for structured logging / machine-readable output.
   */
  toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      hints: this.hints,
      docsUrl: this.docsUrl,
      recoveryAction: this.recoveryAction,
      stack: this.stack,
      cause: this.cause?.message ?? null,
    };
  }
}

/**
 * Thrown when the project declares an incompatible Prisma version.
 * User must align their package.json to the verified pin (prisma@7.10.0).
 */
export class PrismaVersionConflictError extends DXGError {
  constructor(
    message: string,
    options: DXGErrorOptions = {}
  ) {
    super("DXG_E_PRISMA_VERSION_CONFLICT", message, {
      recoverable: true,
      hints: [
        "Align the declared Prisma version to 7.10.0 (or a range containing exactly it, e.g., ^7.10.0)",
        "Run `dxg add database` again after fixing package.json",
      ],
      docsUrl: "https://dxg.dev/errors/prisma-version-conflict",
      recoveryAction: "reconfigure",
      ...options,
    });
    this.name = "PrismaVersionConflictError";
  }
}

/**
 * Thrown when a database provider is not supported by the generator.
 */
export class ProviderUnsupportedError extends DXGError {
  constructor(
    provider: string,
    options: DXGErrorOptions = {}
  ) {
    super(
      "DXG_E_PROVIDER_UNSUPPORTED",
      `Unsupported database provider: ${provider}`,
      {
        recoverable: true,
        hints: [
          "Choose a supported provider: sqlite, postgresql, mysql, sqlserver, cockroachdb, planetscale, prismapostgres",
          "Check the provider spelling and try again",
        ],
        docsUrl: "https://dxg.dev/errors/provider-unsupported",
        recoveryAction: "reconfigure",
        ...options,
      }
    );
    this.name = "ProviderUnsupportedError";
  }
}

/**
 * Thrown when a build script is blocked by the package manager.
 * User must approve the build and rebuild.
 */
export class BuildBlockedError extends DXGError {
  constructor(
    blockedPackages: string[],
    options: DXGErrorOptions = {}
  ) {
    const packageList = blockedPackages.join(", ");
    super(
      "DXG_E_BUILD_BLOCKED",
      `Build scripts blocked for: ${packageList}`,
      {
        recoverable: true,
        hints: [
          `Approve builds: pnpm approve-builds ${packageList} / npm install-scripts approve ${packageList} / bun pm trust ${packageList}`,
          "Then rebuild: pnpm rebuild / npm rebuild / bun install",
        ],
        docsUrl: "https://dxg.dev/errors/build-blocked",
        recoveryAction: "retry",
        ...options,
      }
    );
    this.name = "BuildBlockedError";
  }
}

/**
 * Thrown when a required template file is missing.
 */
export class TemplateMissingError extends DXGError {
  constructor(
    templatePath: string,
    options: DXGErrorOptions = {}
  ) {
    super(
      "DXG_E_TEMPLATE_MISSING",
      `Template file not found: ${templatePath}`,
      {
        recoverable: false,
        hints: [
          "This is likely a DXG installation issue",
          "Try reinstalling DXG: `npm install -g dxg@latest`",
          "If the problem persists, report an issue at https://github.com/dxgjs/dxg/issues",
        ],
        docsUrl: "https://dxg.dev/errors/template-missing",
        recoveryAction: "manual-intervention",
        ...options,
      }
    );
    this.name = "TemplateMissingError";
  }
}

/**
 * Thrown when the dependency installer fails.
 */
export class InstallerFailureError extends DXGError {
  constructor(
    reason: string,
    output: string,
    options: DXGErrorOptions = {}
  ) {
    super(
      "DXG_E_INSTALLER_FAILURE",
      `Dependency installation failed (${reason}): ${output}`,
      {
        recoverable: true,
        hints: [
          "Check the installation output above for the root cause",
          "Ensure you have network connectivity and the package registry is accessible",
          "Try running the suggested package manager command manually",
        ],
        docsUrl: "https://dxg.dev/errors/installer-failure",
        recoveryAction: "retry",
        ...options,
      }
    );
    this.name = "InstallerFailureError";
  }
}

/**
 * Thrown when validation fails (e.g., missing required fields, invalid input).
 */
export class ValidationError extends DXGError {
  constructor(
    message: string,
    options: DXGErrorOptions = {}
  ) {
    super("DXG_E_VALIDATION", message, {
      recoverable: true,
      hints: [
        "Check the error message for the specific validation failure",
        "Provide the required values and try again",
      ],
      docsUrl: "https://dxg.dev/errors/validation",
      recoveryAction: "reconfigure",
      ...options,
    });
    this.name = "ValidationError";
  }
}

/**
 * Thrown when a Git operation fails.
 */
export class GitError extends DXGError {
  constructor(
    message: string,
    options: DXGErrorOptions = {}
  ) {
    super("DXG_E_GIT", `Git operation failed: ${message}`, {
      recoverable: true,
      hints: [
        "Ensure you are in a Git repository",
        "Check that Git is installed and accessible in PATH",
        "Verify you have the necessary permissions",
      ],
      docsUrl: "https://dxg.dev/errors/git",
      recoveryAction: "manual-intervention",
      ...options,
    });
    this.name = "GitError";
  }
}

/**
 * Thrown when a child process spawn fails.
 */
export class SpawnError extends DXGError {
  constructor(
    command: string,
    args: string[],
    message: string,
    options: DXGErrorOptions = {}
  ) {
    super(
      "DXG_E_SPAWN",
      `Failed to spawn ${command} ${args.join(" ")}: ${message}`,
      {
        recoverable: true,
        hints: [
          `Ensure ${command} is installed and in PATH`,
          "Check that the command arguments are valid",
          "Verify you have the necessary permissions to execute the command",
        ],
        docsUrl: "https://dxg.dev/errors/spawn",
        recoveryAction: "manual-intervention",
        ...options,
      }
    );
    this.name = "SpawnError";
  }
}

/**
 * Type guard to check if an error is a DXGError.
 */
export function isDXGError(error: unknown): error is DXGError {
  return error instanceof DXGError;
}

/**
 * Formats a DXGError for user-friendly console output.
 * Includes hints, docs URL, and recovery action.
 */
export function formatError(error: unknown): string {
  if (error instanceof DXGError) {
    let message = `Error [${error.code}]: ${error.message}`;

    if (error.hints.length > 0) {
      message += "\n\nHints:";
      for (const hint of error.hints) {
        message += `\n  • ${hint}`;
      }
    }

    if (error.docsUrl) {
      message += `\n\nDocs: ${error.docsUrl}`;
    }

    if (error.recoveryAction) {
      message += `\nRecovery: ${error.recoveryAction}`;
    }

    if (error.cause) {
      message += `\n\nCaused by: ${error.cause.message}`;
    }

    return message;
  }

  // For regular errors, just return the message
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  // For unknown errors, stringify
  return `Error: ${String(error)}`;
}

/**
 * Formats a DXGError as a machine-readable JSON object.
 * Useful for CI/CD, logging, and programmatic error handling.
 */
export function formatErrorJSON(error: unknown): object {
  if (error instanceof DXGError) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      code: "DXG_E_UNKNOWN",
      message: error.message,
      recoverable: false,
      hints: [],
      docsUrl: "",
      recoveryAction: "abort",
      stack: error.stack,
      cause: null,
    };
  }

  return {
    name: "UnknownError",
    code: "DXG_E_UNKNOWN",
    message: String(error),
    recoverable: false,
    hints: [],
    docsUrl: "",
    recoveryAction: "abort",
    stack: null,
    cause: null,
  };
}

/**
 * Legacy compatibility: formatDXGError -> formatError
 * @deprecated Use formatError instead
 */
export function formatDXGError(error: unknown): string {
  return formatError(error);
}