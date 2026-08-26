import { stat } from "@dxgjs/fs";
import { join } from "path";
import { LanguageInfo } from "./types";

/**
 * Detect the language (TypeScript or JavaScript) by checking for tsconfig.json.
 * @param projectRoot - Absolute path to the project directory.
 * @returns LanguageInfo
 */
export async function detectLanguage(projectRoot: string): Promise<LanguageInfo> {
  const tsconfigPath = join(projectRoot, "tsconfig.json");
  try {
    await stat(tsconfigPath);
    // Try to read the version from tsconfig if possible, but we don't have a standard way.
    // We'll just leave version undefined.
    return { name: "typescript", detected: true };
  } catch {
    // No tsconfig, check for jsconfig or just assume JavaScript if there are .js files?
    // We'll keep it simple: if no tsconfig, assume JavaScript.
    return { name: "javascript", detected: true };
  }
}