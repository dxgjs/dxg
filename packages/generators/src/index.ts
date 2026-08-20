// Import the init generator
import initGenerator from './generators/init';
// Import the tailwind generator
import tailwindGenerator from './generators/tailwind';
// Import the database generator
import databaseGenerator from './generators/database';
// Import the auth generator
import authGenerator from './generators/auth';

export { initGenerator, tailwindGenerator, databaseGenerator, authGenerator };

// Default export for convenience (keep existing behavior)
export default initGenerator;