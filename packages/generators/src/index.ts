import type { GeneratorContext } from "./types";

// Re-define the example generator here (copy from memory)
const reactComponentGenerator = {
  name: 'react-component',
  description: 'Generate a basic React component',
  prompts: [
    {
      type: 'input',
      name: 'componentName',
      message: 'What should the component be called?',
      validate: (input: unknown) => {
        if (typeof input !== 'string' || !input || input.trim() === '') {
          return 'Component name is required';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'componentPath',
      message: 'Where should the component be created? (e.g., components/Button)',
      default: 'components'
    }
  ],
  async run(answers: Record<string, unknown>, context: GeneratorContext) {
    const { componentName, componentPath } = answers;
    const { logger, fs } = context;

    const componentFileName = `${componentName}.tsx`;
    const componentDir = `${componentPath}/${componentName}`;
    const componentFilePath = `${componentDir}/${componentFileName}`;
    const indexFilePath = `${componentDir}/index.ts`;

    const componentContent = `import React from 'react';

interface ${componentName}Props {
  // Add your props here
}

const ${componentName}: React.FC<${componentName}Props> = ({}) => {
  return (
    <div>
      <h1>${componentName}</h1>
    </div>
  );
};

export default ${componentName};
`;

    const indexContent = `export { default } from './${componentName}';`;

    try {
      await fs.writeFile(componentFilePath, componentContent, { encoding: 'utf8' });
      logger.info(`Created ${componentFilePath}`);

      await fs.writeFile(indexFilePath, indexContent, { encoding: 'utf8' });
      logger.info(`Created ${indexFilePath}`);

      logger.info(`Component ${componentName} generated successfully!`);
    } catch (error) {
      logger.error(`Failed to generate component: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
  }
}
};

// Import the init generator we just created
import initGenerator from './generators/init';
// Import the tailwind generator
import tailwindGenerator from './generators/tailwind';
// Import the database generator
import databaseGenerator from './generators/database';

export { initGenerator, reactComponentGenerator, tailwindGenerator, databaseGenerator };

// Default export for convenience (keep existing behavior)
export default reactComponentGenerator;