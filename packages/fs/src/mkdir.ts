import { promises as fs } from 'fs';
import * as fsSync from 'fs';

type MkdirOptions = Parameters<typeof fs.mkdir>[1];

export async function mkdir(
  filePath: Parameters<typeof fs.mkdir>[0],
  options?: MkdirOptions
): Promise<ReturnType<typeof fs.mkdir>> {
  return await fs.mkdir(filePath, options);
}

export function mkdirSync(
  filePath: Parameters<typeof fsSync.mkdirSync>[0],
  options?: Parameters<typeof fsSync.mkdirSync>[1]
): ReturnType<typeof fsSync.mkdirSync> {
  return fsSync.mkdirSync(filePath, options);
}