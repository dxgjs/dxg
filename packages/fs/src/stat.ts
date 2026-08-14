import * as fs from 'fs';

export async function stat(filePath: string): Promise<fs.Stats> {
  return await fs.promises.stat(filePath);
}

export function statSync(filePath: string): fs.Stats {
  return fs.statSync(filePath);
}