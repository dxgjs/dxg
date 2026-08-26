import { promises as fs } from 'fs';
import * as fsSync from 'fs';

type WriteFileOptions = Parameters<typeof fs.writeFile>[2];

export function writeFile(
  filePath: Parameters<typeof fs.writeFile>[0],
  data: Parameters<typeof fs.writeFile>[1],
  options?: WriteFileOptions
): ReturnType<typeof fs.writeFile> {
  return fs.writeFile(filePath, data, options);
}

export function writeFileSync(
  filePath: Parameters<typeof fsSync.writeFileSync>[0],
  data: Parameters<typeof fsSync.writeFileSync>[1],
  options?: Parameters<typeof fsSync.writeFileSync>[2]
): ReturnType<typeof fsSync.writeFileSync> {
  return fsSync.writeFileSync(filePath, data, options);
}