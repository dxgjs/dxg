import { readFile } from '@dxgjs/fs';
import { join } from 'path';
import { Logger } from '@dxgjs/logger';

const logger = new Logger({ minLevel: 'warn' });

/**
 * Importers/callers: apps/cli/src/index.ts (uses loadConfig to get project config)
 * Affected API: DXGConfig interface now includes optional description field; loadConfig returns config with description
 * Data schemas: DXGConfig = { name?: string, version?: string, description?: string }
 * User's verbatim instruction: Continue with DXG Real-World Usage & Validation Phase - fix build error to allow CLI to use config.description
 */
export interface DXGConfig {
  name?: string;
  version?: string;
  description?: string;
}

export async function loadConfig(rootPath: string): Promise<DXGConfig> {
  const defaultConfig: DXGConfig = {
    name: 'dxg-project',
    version: '0.0.0',
  };

  // Try json first
  const jsonPath = join(rootPath, 'dxg.config.json');
  try {
    const content = await readFile(jsonPath, 'utf8');
    // content could be Buffer if encoding not honored; ensure string
    const contentStr = Buffer.isBuffer(content) ? content.toString('utf8') : content;
    const parsed = JSON.parse(contentStr);
    if (typeof parsed === 'object' && parsed !== null) {
      return { ...defaultConfig, ...parsed };
    }
  } catch (_) {
    // json not found or invalid, try js
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  }

  // Try js
  const jsPath = join(rootPath, 'dxg.config.js');
  try {
    // Use dynamic import to support both ES and CJS
    const mod = await import(jsPath);
    const parsed = mod.default ?? mod;
    if (typeof parsed === 'object' && parsed !== null) {
      return { ...defaultConfig, ...parsed };
    }
  } catch (err) {
    // If the error is not a module not found, we warn
    if (err instanceof Error && ('code' in err) && (err as any).code !== 'MODULE_NOT_FOUND') {
      logger.warn(`Failed to load dxg.config.js: ${err.message}`);
    }
    // fall through to default
  }

  return defaultConfig;
}