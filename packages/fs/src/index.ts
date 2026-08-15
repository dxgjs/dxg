import { readFile, readFileSync } from './readFile';
import { writeFile, writeFileSync } from './writeFile';
import { readdir, readdirSync } from './readdir';
import { stat, statSync } from './stat';
import { sep, join, dirname, relative, resolve } from './path';
import { mkdir, mkdirSync } from './mkdir';
import { rm, rmSync } from './rm';
import { copyFile, copyFileSync } from './copyFile';
import { appendFile, appendFileSync } from './appendFile';

export { readFile, readFileSync };
export { writeFile, writeFileSync };
export { readdir, readdirSync };
export { stat, statSync };
export { sep, join, dirname, relative, resolve };
export { mkdir, mkdirSync };
export { rm, rmSync };
export { copyFile, copyFileSync };
export { appendFile, appendFileSync };

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