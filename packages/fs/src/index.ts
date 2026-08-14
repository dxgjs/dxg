import { readFile, readFileSync } from './readFile';
import { writeFile, writeFileSync } from './writeFile';
import { readdir, readdirSync } from './readdir';
import { stat, statSync } from './stat';
import { sep, join, dirname, relative, resolve } from './path';

export { readFile, readFileSync };
export { writeFile, writeFileSync };
export { readdir, readdirSync };
export { stat, statSync };
export { sep, join, dirname, relative, resolve };

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export function pathExistsSync(filePath: string): boolean {
  try {
    statSync(filePath);
    return true;
  } catch {
    return false;
  }
}