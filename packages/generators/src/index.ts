// Import the init generator
import initGenerator from './generators/init';
// Import the tailwind generator
import tailwindGenerator from './generators/tailwind';
// Import the database generator
import databaseGenerator from './generators/database';
// Import the auth generator
import authGenerator from './generators/auth';
// Import the Generator type
import type { Generator } from './types';

export { initGenerator, tailwindGenerator, databaseGenerator, authGenerator, Generator };

// Default export for convenience (keep existing behavior)
export default initGenerator;