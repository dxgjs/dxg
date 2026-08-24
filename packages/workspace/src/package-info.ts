import { readFile } from "@dxgjs/fs";
import { join } from "path";
import { PackageJson } from "./types";

/**
 * Reads and parses the package.json file at the given directory.
 * @param projectRoot - Absolute path to the project directory.
 * @returns Promise resolving to the parsed package.json object.
 */
export async function getPackageInfo(projectRoot: string): Promise<PackageJson> {
  const packageJsonPath = join(projectRoot, "package.json");
  const packageJsonContentBuffer = await readFile(packageJsonPath, {
    encoding: "utf8",
  });
  const packageJsonContent = typeof packageJsonContentBuffer === 'string' ? packageJsonContentBuffer : packageJsonContentBuffer.toString();
  return JSON.parse(packageJsonContent);
}