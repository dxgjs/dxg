// Enhanced error class for DXG CLI with hints and suggestions
export class DXGError extends Error {
  public hint?: string;
  public suggestion?: string;

  constructor(message: string, options: { hint?: string; suggestion?: string } = {}) {
    super(message);
    this.name = 'DXGError';
    this.hint = options.hint;
    this.suggestion = options.suggestion;

    // Maintains proper stack trace (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DXGError);
    }
  }
}

/**
 * Formats a DXGError for display to the user
 * Includes hint and suggestion when available
 */
export function formatDXGError(error: unknown): string {
  if (error instanceof DXGError) {
    let message = `Error: ${error.message}`;

    if (error.hint) {
      message += `\nHint: ${error.hint}`;
    }

    if (error.suggestion) {
      message += `\nSuggestion: ${error.suggestion}`;
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