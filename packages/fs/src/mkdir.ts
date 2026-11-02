import { promises as fs } from 'fs';
import * as fsSync from 'fs';

export type MkdirOptions = Parameters<typeof fs.mkdir>[1];

export function mkdir(
  filePath: Parameters<typeof fs.mkdir>[0],
  options?: MkdirOptions
): ReturnType<typeof fs.mkdir> {
  return fs.mkdir(filePath, options);
}

export function mkdirSync(
  filePath: Parameters<typeof fsSync.mkdirSync>[0],
  options?: Parameters<typeof fsSync.mkdirSync>[1]
): ReturnType<typeof fsSync.mkdirSync> {
  return fsSync.mkdirSync(filePath, options);
}