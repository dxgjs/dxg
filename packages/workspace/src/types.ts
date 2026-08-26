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

export interface FrameworkInfo {
  name: "next-app" | "next-pages" | "next" | "vite" | "astro" | "react-router" | "unknown";
  detected: boolean;
  version?: string;
}

export interface LanguageInfo {
  name: "typescript" | "javascript";
  detected: boolean;
  version?: string;
}

export interface StylingInfo {
  name: string;
  detected: boolean;
  version: "v3" | "v4" | null;
  configFile: string | null;
}

export interface CapabilityInfo {
  hasTests: boolean;
  hasLinting: boolean;
  hasFormatter: boolean;
  hasCI: boolean;
  hasDocker: boolean;
}

export interface PackageJson {
  name: string;
  version?: string;
  private: boolean;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

export interface ProjectAwareness {
  projectRoot: string;
  workspaceRoot: string;
  framework: FrameworkInfo;
  language: LanguageInfo;
  packageManager: string;
  styling: StylingInfo;
  capabilities: CapabilityInfo;
}