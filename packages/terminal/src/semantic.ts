import { ansi } from './ansi';
import picocolors from 'picocolors';

/**
 * Semantic color primitives for DXG terminal UX
 * These provide meaningful, intent-based styling rather than raw colors
 */

/**
 * Success indicator - green
 */
export const success = (text: string): string => picocolors.green(text);

/**
 * Error indicator - red
 */
export const error = (text: string): string => picocolors.red(text);

/**
 * Warning indicator - yellow
 */
export const warning = (text: string): string => picocolors.yellow(text);

/**
 * Info indicator - blue/cyan
 */
export const info = (text: string): string => picocolors.blue(text);

/**
 * Muted/dimmed text - gray
 */
export const muted = (text: string): string => picocolors.gray(text);

/**
 * Accent/emphasis - magenta
 */
export const accent = (text: string): string => picocolors.magenta(text);

/**
 * Symbol vocabulary for DXG terminal UX
 */

/**
 * Step symbols
 */
export const symbols = {
  // Step indicators
  stepActive: ansi.bold(ansi.cyan('◆')),
  stepCompleted: ansi.bold(ansi.green('◇')),
  stepCancelled: ansi.bold(ansi.red('■')),

  // Selection indicators
  selectActive: ansi.bold(ansi.green('●')),
  selectInactive: ansi.dim('○'),

  // Status indicators
  statusSuccess: ansi.bold(ansi.green('✓')),
  statusError: ansi.bold(ansi.red('✕')),
  statusWarning: ansi.bold(ansi.yellow('!')),
  statusInfo: ansi.bold(ansi.blue('•')),

  // Structural elements
  barVertical: ansi.dim('│'),
  barHorizontal: ansi.dim('─'),
  // Box drawing
  boxTopLeft: ansi.dim('┌'),
  boxTopRight: ansi.dim('┐'),
  boxBottomLeft: ansi.dim('└'),
  boxBottomRight: ansi.dim('┘'),
  boxVertical: ansi.dim('│'),
  boxHorizontal: ansi.dim('─'),
};

/**
 * Terminal UI helper functions
 */

/**
 * Formats a step in a process
 * @param label - The step label
 * @param status - 'active' | 'completed' | 'cancelled'
 */
export const step = (label: string, status: 'active' | 'completed' | 'cancelled' = 'active'): string => {
  const stepSymbol = {
    active: symbols.stepActive,
    completed: symbols.stepCompleted,
    cancelled: symbols.stepCancelled,
  }[status];

  return `${stepSymbol} ${label}`;
};

/**
 * Formats a success message
 */
export const successMessage = (message: string): string => {
  return `${symbols.statusSuccess} ${message}`;
};

/**
 * Formats an error message
 */
export const errorMessage = (message: string): string => {
  return `${symbols.statusError} ${message}`;
};

/**
 * Formats a warning message
 */
export const warningMessage = (message: string): string => {
  return `${symbols.statusWarning} ${message}`;
};

/**
 * Formats an info message
 */
export const infoMessage = (message: string): string => {
  return `${symbols.statusInfo} ${message}`;
};

/**
 * Creates a visual separator
 */
export const separator = (length: number = 40): string => {
  return symbols.barHorizontal.repeat(length);
};

/**
 * Creates a boxed content area
 * @param content - The content to box (can be multi-line)
 * @param title - Optional title for the box
 */
export const box = (content: string, title?: string): string => {
  const lines = content.split('\n');
  const maxLength = Math.max(...lines.map(line => line.length), title ? title.length : 0);
  const paddedWidth = maxLength + 2; // Add padding

  const topLine = `${symbols.boxTopLeft}${symbols.boxHorizontal.repeat(paddedWidth)}${symbols.boxTopRight}`;
  const bottomLine = `${symbols.boxBottomLeft}${symbols.boxHorizontal.repeat(paddedWidth)}${symbols.boxBottomRight}`;

  const contentLines = lines.map(line => {
    const padding = ' '.repeat(paddedWidth - line.length);
    return `${symbols.boxVertical} ${line}${padding}${symbols.boxVertical}`;
  });

  let result = topLine + '\n';

  if (title) {
    const titlePadding = ' '.repeat(paddedWidth - title.length);
    result += `${symbols.boxVertical} ${title}${titlePadding}${symbols.boxVertical}\n`;
    // Add a separator line under the title
    result += `${symbols.boxVertical}${symbols.boxHorizontal.repeat(paddedWidth + 2)}${symbols.boxVertical}\n`;
  }

  result += contentLines.join('\n') + '\n';
  result += bottomLine;

  return result;
};