type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  minLevel?: LogLevel; // defaults to 'info'
}

class Logger {
  private minLevel: LogLevel;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel ?? 'info';
  }

  private levelToNumber(level: LogLevel): number {
    const map: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return map[level];
  }

  private log(level: LogLevel, message: string): void {
    if (this.levelToNumber(level) < this.levelToNumber(this.minLevel)) return;
    const timestamp = new Date().toISOString();
    const colorMap: Record<LogLevel, string> = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m',  // green
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m', // red
    };
    const color = colorMap[level] ?? '';
    const reset = '\x1b[0m';
    const formatted = `${color}[${timestamp}] ${level.toUpperCase()}${reset} ${message}`;
    process.stdout.write(formatted + '\n');
  }

  debug(message: string): void { this.log('debug', message); }
  info(message: string): void  { this.log('info', message); }
  warn(message: string): void  { this.log('warn', message); }
  error(message: string): void { this.log('error', message); }
}

export { Logger };
export type { LogLevel, LoggerOptions };