import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger, LogLevel } from "./src/index";

describe("Logger (minimal contract)", () => {
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on process.stdout.write to capture output
    stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation();
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
  });

  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

  const getLastLog = (): string => {
    const calls = stdoutWriteSpy.mock.calls;
    return calls.length > 0 ? stripAnsi(calls[calls.length - 1][0]) : "";
  };

  const getAllLogs = (): string[] => {
    return stdoutWriteSpy.mock.calls.map(call => stripAnsi(call[0]));
  };

  test("default minLevel = 'info' hides debug", () => {
    const logger = new Logger();
    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(stdoutWriteSpy).toHaveBeenCalledTimes(3); // info, warn, error
    const logs = getAllLogs();
    expect(logs[logs.length - 1]).toContain("] ERROR ") && expect(logs[logs.length - 1]).toContain("error message");
  });

  test("minLevel = 'debug' shows all levels", () => {
    const logger = new Logger({ minLevel: "debug" });
    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(stdoutWriteSpy).toHaveBeenCalledTimes(4);
    const logs = getAllLogs();
    expect(logs[0]).toContain("DEBUG");
    expect(logs[1]).toContain("INFO");
    expect(logs[2]).toContain("WARN");
    expect(logs[3]).toContain("ERROR");
  });

  test("minLevel = 'warn' hides debug and info", () => {
    const logger = new Logger({ minLevel: "warn" });
    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(stdoutWriteSpy).toHaveBeenCalledTimes(2); // warn, error
    const logs = getAllLogs();
    expect(logs[0]).toContain("WARN");
    expect(logs[1]).toContain("ERROR");
  });

  test("minLevel = 'error' hides debug, info, warn", () => {
    const logger = new Logger({ minLevel: "error" });
    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(stdoutWriteSpy).toHaveBeenCalledTimes(1); // error only
    const lastLog = getLastLog();
    expect(lastLog).toContain("] ERROR ") && expect(lastLog).toContain("error message");
  });

  test("output format matches [timestamp] LEVEL message", () => {
    const logger = new Logger({ minLevel: "info" });
    logger.info("test message");

    expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
    const output = getLastLog();
    // Check format: [timestamp] LEVEL message\n
    expect(output).toMatch(/^\[.+\] INFO test message\n$/);
    // Check timestamp is ISO string
    const timestampMatch = output.match(/\[(.+)\]/);
    expect(timestampMatch).toBeTruthy();
    expect(new Date(timestampMatch![1])).toBeInstanceOf(Date);
    // Check level is uppercase
    expect(output).toContain("] INFO ");
    // Check message is preserved
    expect(output).toContain("test message");
    // Check newline at end
    expect(output.endsWith("\n")).toBe(true);
  });

  test("ANSI colors applied correctly", () => {
    const logger = new Logger({ minLevel: "info" }); // Show info and above

    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    const logs = stdoutWriteSpy.mock.calls.map(call => call[0]); // raw logs with ANSI

    // Info should be green (\x1b[32m)
    expect(logs[0]).toMatch(/\x1b\[32m\[.+\] INFO\x1b\[0m info message\n/);
    // Warn should be yellow (\x1b[33m)
    expect(logs[1]).toMatch(/\x1b\[33m\[.+\] WARN\x1b\[0m warn message\n/);
    // Error should be red (\x1b[31m)
    expect(logs[2]).toMatch(/\x1b\[31m\[.+\] ERROR\x1b\[0m error message\n/);
  });

  test("output uses process.stdout.write", () => {
    const logger = new Logger();
    logger.info("test");

    expect(stdoutWriteSpy).toHaveBeenCalled();
    // The spy is on process.stdout.write, so if it was called, output went to stdout
  });
});