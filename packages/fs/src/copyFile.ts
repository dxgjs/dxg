import { promises as fs } from 'fs';
import * as fsSync from 'fs';

type CopyFileOptions = Parameters<typeof fs.copyFile>[2];

export async function copyFile(
  src: Parameters<typeof fs.copyFile>[0],
  dest: Parameters<typeof fs.copyFile>[1],
  options?: CopyFileOptions
): Promise<ReturnType<typeof fs.copyFile>> {
  return await fs.copyFile(src, dest, options);
}

export function copyFileSync(
  src: Parameters<typeof fsSync.copyFileSync>[0],
  dest: Parameters<typeof fsSync.copyFileSync>[1],
  options?: Parameters<typeof fsSync.copyFileSync>[2]
): ReturnType<typeof fsSync.copyFileSync> {
  return fsSync.copyFileSync(src, dest, options);
}