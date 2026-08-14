import { LogEntry, LogLevel } from './types';

// ANSI color codes
const colors: Record<LogLevel, string> = {
  trace: '\x1b[90m', // bright black
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  fatal: '\x1b[35m', // magenta
};
const reset = '\x1b[0m';

export function format(entry: LogEntry): string {
  const timestamp = entry.timestamp.toISOString();
  const level = entry.level.toUpperCase();
  const color = colors[entry.level] ?? '';
  const message = entry.message;

  // Build context string (excluding reserved fields)
  const contextEntries = Object.entries(entry)
    .filter(([key]) => !['level', 'message', 'timestamp'].includes(key))
    .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
    .join(' ');

  const contextStr = contextEntries ? ` ${contextEntries}` : '';

  return `${color}[${timestamp}] ${level}${reset}${message}${contextStr}`;
}