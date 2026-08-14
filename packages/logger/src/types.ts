export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerOptions {
  minLevel?: LogLevel;
  transports?: Transport[];
  formatter?: (entry: LogEntry) => string;
  context?: Record<string, unknown>;
}

export interface Transport {
  write(message: string): void;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  [key: string]: unknown;
}