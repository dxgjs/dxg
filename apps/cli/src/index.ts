import { Logger } from '@dxgjs/logger';

// Initialize logger
const logger = new Logger({ minLevel: 'info' });

// Simple CLI entry point
async function main() {
  logger.info('Welcome to DXG CLI!');
  logger.info('Version: 0.0.0');
  logger.info('Run `dxg --help` for available commands.');
}

// Execute main and handle errors
main().catch((error) => {
  logger.error(`CLI error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

// Export empty object to satisfy esbuild if needed
export {};