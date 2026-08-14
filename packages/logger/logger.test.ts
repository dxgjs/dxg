import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from './src/index';

// Mock transport to capture log output
class MockTransport {
  writes: string[] = [];

  write(message: string) {
    this.writes.push(message);
  }

  clear() {
    this.writes = [];
  }
}

describe('Logger', () => {
  let logger: Logger;
  let mockTransport: MockTransport;

  beforeEach(() => {
    mockTransport = new MockTransport();
    logger = new Logger({
      minLevel: 'info',
      transports: [mockTransport],
      formatter: (entry) => JSON.stringify(entry)
    });
  });

  afterEach(() => {
    mockTransport.clear();
  });

  test('should log info messages', () => {
    logger.info('Test message');
    expect(mockTransport.writes.length).toBe(1);
    const logEntry = JSON.parse(mockTransport.writes[0]);
    expect(logEntry.level).toBe('info');
    expect(logEntry.message).toBe('Test message');
    // Timestamp should be a valid ISO string
    expect(new Date(logEntry.timestamp)).toBeInstanceOf(Date);
  });

  test('should respect log levels', () => {
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');

    expect(mockTransport.writes.length).toBe(2); // info and warn only
    const infoLog = JSON.parse(mockTransport.writes[0]);
    const warnLog = JSON.parse(mockTransport.writes[1]);
    expect(infoLog.level).toBe('info');
    expect(warnLog.level).toBe('warn');
    // Timestamps should be valid ISO strings
    expect(new Date(infoLog.timestamp)).toBeInstanceOf(Date);
    expect(new Date(warnLog.timestamp)).toBeInstanceOf(Date);
  });

  test('should include context', () => {
    // Create a new logger with context for this test
    const testLogger = new Logger({
      minLevel: 'info',
      transports: [mockTransport],
      formatter: (entry) => JSON.stringify(entry),
      context: { userId: '123', requestId: 'abc' }
    });

    testLogger.info('Test message');
    expect(mockTransport.writes.length).toBe(1);
    const logEntry = JSON.parse(mockTransport.writes[0]);
    expect(logEntry.level).toBe('info');
    expect(logEntry.message).toBe('Test message');
    expect(logEntry.userId).toBe('123');
    expect(logEntry.requestId).toBe('abc');
    // Timestamp should be a valid ISO string
    expect(new Date(logEntry.timestamp)).toBeInstanceOf(Date);
  });

  test('should update context', () => {
    logger.updateContext({ sessionId: 'session123' });
    logger.info('Test message');

    expect(mockTransport.writes.length).toBe(1);
    const logEntry = JSON.parse(mockTransport.writes[0]);
    expect(logEntry.level).toBe('info');
    expect(logEntry.message).toBe('Test message');
    expect(logEntry.sessionId).toBe('session123');
    // Timestamp should be a valid ISO string
    expect(new Date(logEntry.timestamp)).toBeInstanceOf(Date);
  });

  test('should set level dynamically', () => {
    logger.setLevel('debug');
    logger.debug('Debug message');

    expect(mockTransport.writes.length).toBe(1);
    const logEntry = JSON.parse(mockTransport.writes[0]);
    expect(logEntry.level).toBe('debug');
    expect(logEntry.message).toBe('Debug message');
    // Timestamp should be a valid ISO string
    expect(new Date(logEntry.timestamp)).toBeInstanceOf(Date);
  });
});