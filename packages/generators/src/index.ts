// Import the database generator
import databaseGenerator from './generators/database';
// Import the Generator type
import type { Generator } from './types';

// Dependency-installation engine (internal module, re-exported for the CLI
// which builds the installer seam in prepareContext)
export * from './install';

export { databaseGenerator, Generator };

// Default export for convenience (database generator is the only one)
export default databaseGenerator;