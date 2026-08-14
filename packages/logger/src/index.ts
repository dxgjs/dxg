import { format } from './formatter';
import { ConsoleTransport } from './transports/console';
import { LoggerOptions, Transport, LogLevel, LogEntry } from './types';

export class Logger {
  private minLevel: LogLevel;
  private transports: Transport[];
  private formatter: (entry: LogEntry) => string;
  private context: Record<string, unknown>;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.transports = options.transports ?? [new ConsoleTransport()];
    this.formatter = options.formatter ?? format;
    this.context = options.context ?? {};
  }

  log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
    if (this.levelToNumber(level) < this.levelToNumber(this.minLevel)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      ...this.context,
      ...meta,
    };

    const formatted = this.formatter(entry);
    for (const transport of this.transports) {
      transport.write(formatted);
    }
  }

  trace(message: string, meta: Record<string, unknown> = {}): void {
    this.log('trace', message, meta);
  }

  debug(message: string, meta: Record<string, unknown> = {}): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta: Record<string, unknown> = {}): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta: Record<string, unknown> = {}): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta: Record<string, unknown> = {}): void {
    this.log('error', message, meta);
  }

  fatal(message: string, meta: Record<string, unknown> = {}): void {
    this.log('fatal', message, meta);
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  addTransport(transport: Transport): void {
    this.transports.push(transport);
  }

  setContext(context: Record<string, unknown>): void {
    this.context = context;
  }

  updateContext(context: Record<string, unknown>): void {
    this.context = { ...this.context, ...context };
  }

  private levelToNumber(level: LogLevel): number {
    const levels: Record<LogLevel, number> = {
      trace: 0,
      debug: 1,
      info: 2,
      warn: 3,
      error: 4,
      fatal: 5,
    };
    return levels[level];
  }
}


export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}

// Default export for convenience
export default { Logger, createLogger };