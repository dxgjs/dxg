import { promises as fs } from 'fs';
import * as fsSync from 'fs';

type ReadFileOptions = Parameters<typeof fs.readFile>[1];

export function readFile(
  filePath: Parameters<typeof fs.readFile>[0],
  options?: ReadFileOptions
): ReturnType<typeof fs.readFile> {
  return fs.readFile(filePath, options);
}

export function readFileSync(
  filePath: Parameters<typeof fsSync.readFileSync>[0],
  options?: Parameters<typeof fsSync.readFileSync>[1]
): ReturnType<typeof fsSync.readFileSync> {
  return fsSync.readFileSync(filePath, options);
}