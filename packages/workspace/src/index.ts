import { readFile, stat } from '@dxgjs/fs';
import { join, dirname } from 'path';
import { Logger } from '@dxgjs/logger';

const logger = new Logger({ minLevel: 'info' });

export interface WorkspaceProject {
  name: string;
  version?: string;
  location: string; // absolute path to the project directory
  workspaceDependencies: string[]; // list of workspace project names
}

export interface WorkspaceResult {
  root: string; // absolute path to the workspace root
  projects: WorkspaceProject[];
}

export async function detectWorkspace(root?: string): Promise<WorkspaceResult> {
  const start = root ?? process.cwd();
  let current = start;

  // Look for workspace definition files
  const workspaceFiles = ['pnpm-workspace.yaml', 'turbo.json', 'nx.json', 'lerna.json'];
  let workspaceRoot = null;

  while (true) {
    for (const file of workspaceFiles) {
      try {
        await stat(join(current, file));
        workspaceRoot = current;
        break;
      } catch (_) {
        // File not found, continue
      }
    }
    if (workspaceRoot) break;

    const parent = dirname(current);
    if (parent === current) {
      // Reached the filesystem root
      break;
    }
    current = parent;
  }

  if (!workspaceRoot) {
    throw new Error('No workspace root found. Looked for pnpm-workspace.yaml, turbo.json, nx.json, lerna.json');
  }

  // Read the root package.json
  const rootPackageJsonPath = join(workspaceRoot, 'package.json');
  let rootPackageJson: any;
  try {
    const rootPackageJsonContent = (await readFile(rootPackageJsonPath, { encoding: 'utf8' })) as string;
    rootPackageJson = JSON.parse(rootPackageJsonContent);
    // Simple validation: check for required fields
    if (typeof rootPackageJson.name !== 'string' || typeof rootPackageJson.private !== 'boolean') {
      logger.warn(`Root package.json at ${rootPackageJsonPath} is missing required fields: name (string) and private (boolean)`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read or parse root package.json at ${rootPackageJsonPath}: ${msg}`);
  }

  // Determine workspace packages from the root package.json
  let workspacePackages: string[] = [];
  if (Array.isArray(rootPackageJson.workspaces)) {
    workspacePackages = rootPackageJson.workspaces;
  } else if (rootPackageJson.workspaces && Array.isArray(rootPackageJson.workspaces.packages)) {
    workspacePackages = rootPackageJson.workspaces.packages;
  }

  // Always include the root package (current directory)
  // If no workspaces defined in package.json, we still include the root as '.'
  // If workspaces are defined, we still include the root package
  workspacePackages.unshift('.');

  // Normalize workspace package patterns to absolute paths
  const projectPaths: string[] = [];
  for (const pattern of workspacePackages) {
    // For simplicity, we assume the pattern is a relative path or a glob.
    // We only support direct directory names for now (no globbing).
    const projectPath = join(workspaceRoot, pattern);
    projectPaths.push(projectPath);
  }

  // Read each project's package.json
  const projects: WorkspaceProject[] = [];
  for (const projectPath of projectPaths) {
    try {
      const packageJsonPath = join(projectPath, 'package.json');
      const packageJsonContent = (await readFile(packageJsonPath, { encoding: 'utf8' })) as string;
      const packageJson: any = JSON.parse(packageJsonContent);

      const project: WorkspaceProject = {
        name: packageJson.name,
        version: packageJson.version,
        location: projectPath,
        workspaceDependencies: [] // We'll fill this later if needed
      };

      projects.push(project);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to read package.json for project at ${projectPath}: ${msg}`);
    }
  }

  // TODO: Calculate workspace dependencies by reading each project's dependencies and linking to workspace projects by name.

  return { root: workspaceRoot, projects };
}