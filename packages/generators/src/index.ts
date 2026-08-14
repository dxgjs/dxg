// Example generator: creates a basic React component
import { Generator } from './types';

export const reactComponentGenerator: Generator = {
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
  async run(answers, context) {
    const { componentName, componentPath } = answers;
    const { logger, fs } = context;

    const componentFileName = `${componentName}.tsx`;
    const componentDir = `${componentPath}/${componentName}`;
    const componentFilePath = `${componentDir}/${componentFileName}`;
    const indexFilePath = `${componentDir}/index.ts`;

    // Generate component content
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

    const indexContent = `export { default } from './${componentName}';
`;

    try {
      // Write component file
      await fs.writeFile(componentFilePath, componentContent, { encoding: 'utf8' });
      logger.info(`Created ${componentFilePath}`);

      // Write index file
      await fs.writeFile(indexFilePath, indexContent, { encoding: 'utf8' });
      logger.info(`Created ${indexFilePath}`);

      logger.info(`Component ${componentName} generated successfully!`);
    } catch (error) {
      logger.error(`Failed to generate component: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
};

// Export types
export type { Generator, GeneratorContext, GeneratorPrompt } from './types';

// Default export for convenience
export default reactComponentGenerator;