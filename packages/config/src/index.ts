import { readFile } from "@dxgjs/fs";
import { join } from "path";
import { Logger } from "@dxgjs/logger";

const logger = new Logger({ minLevel: "warn" });

/**
 * Importers/callers: apps/cli/src/index.ts (uses loadConfig to get project config)
 * Affected API: DXGConfig interface now includes optional description field; loadConfig returns config with description
 * Data schemas: DXGConfig = { name?: string, version?: string, description?: string }
 */
export interface DXGConfig {
  name?: string;
  version?: string;
  description?: string;
}

/**
 * Validates a DXG configuration object.
 * Returns a validated config object with only the valid fields,
 * and logs warnings for any invalid fields.
 */
function validateDXGConfig(config: unknown): DXGConfig {
  if (typeof config !== "object" || config === null) {
    logger.warn(
      "Configuration must be an object. Using default configuration.",
    );
    return {};
  }

  const validated: Partial<DXGConfig> = {};

  // Validate name field
  if ("name" in config && config.name !== undefined) {
    if (typeof config.name === "string") {
      validated.name = config.name;
    } else {
      logger.warn(
        `Configuration field 'name' must be a string. Received: ${typeof config.name}. Ignoring this field.`,
      );
    }
  }

  // Validate version field
  if ("version" in config && config.version !== undefined) {
    if (typeof config.version === "string") {
      validated.version = config.version;
    } else {
      logger.warn(
        `Configuration field 'version' must be a string. Received: ${typeof config.version}. Ignoring this field.`,
      );
    }
  }

  // Validate description field
  if ("description" in config && config.description !== undefined) {
    if (typeof config.description === "string") {
      validated.description = config.description;
    } else {
      logger.warn(
        `Configuration field 'description' must be a string. Received: ${typeof config.description}. Ignoring this field.`,
      );
    }
  }

  // Warn about unknown fields
  const knownFields = ["name", "version", "description"] as const;
  const unknownFields = Object.keys(config as object).filter(
    (key) => !knownFields.includes(key as "name" | "version" | "description"),
  );

  if (unknownFields.length > 0) {
    logger.warn(
      `Unknown configuration fields: ${unknownFields.join(", ")}. These fields will be ignored.`,
    );
  }

  return validated as DXGConfig;
}

export async function loadConfig(rootPath: string): Promise<DXGConfig> {
  const defaultConfig: DXGConfig = {
    name: "dxg-project",
    version: "0.0.0",
  };

  // Try json first
  const jsonPath = join(rootPath, "dxg.config.json");
  try {
    const content = await readFile(jsonPath, "utf8");
    const contentStr = Buffer.isBuffer(content)
      ? content.toString("utf8")
      : content;
    let parsed: unknown;
    try {
      parsed = JSON.parse(contentStr);
    } catch (err) {
      logger.warn(
        `Failed to parse dxg.config.json as JSON: ${err instanceof Error ? err.message : String(err)}. Using default configuration.`,
      );
      return defaultConfig;
    }

    if (typeof parsed === "object" && parsed !== null) {
      const validatedConfig = validateDXGConfig(parsed);
      return { ...defaultConfig, ...validatedConfig };
    } else {
      logger.warn(
        `dxg.config.json did not parse to an object. Using default configuration.`,
      );
      return defaultConfig;
    }
  } catch {
    // json not found or file read error, try js
  }

  // Try js
  const jsPath = join(rootPath, "dxg.config.js");
  try {
    // Use dynamic import to support both ES and CJS
    const mod = await import(jsPath);
    const parsed: unknown = mod.default ?? mod;

    // Handle case where the module is a function or other non-object
    if (typeof parsed !== "object" || parsed === null) {
      logger.warn(
        `dxg.config.js did not export an object. Using default configuration.`,
      );
      return defaultConfig;
    }

    const validatedConfig = validateDXGConfig(parsed);
    return { ...defaultConfig, ...validatedConfig };
  } catch (err) {
    // If the error is not a module not found, we warn
    if (
      err instanceof Error &&
      "code" in err &&
      typeof err.code === "string" &&
      err.code !== "MODULE_NOT_FOUND"
    ) {
      logger.warn(
        `Failed to load dxg.config.js: ${err.message}. Using default configuration.`,
      );
    }
    // fall through to default
  }

  return defaultConfig;
}
