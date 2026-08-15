import { promises as fs } from 'fs';
import * as fsSync from 'fs';

type RmOptions = Parameters<typeof fs.rm>[1];

export async function rm(
  filePath: Parameters<typeof fs.rm>[0],
  options?: RmOptions
): Promise<ReturnType<typeof fs.rm>> {
  return await fs.rm(filePath, options);
}

export function rmSync(
  filePath: Parameters<typeof fsSync.rmSync>[0],
  options?: Parameters<typeof fsSync.rmSync>[1]
): ReturnType<typeof fsSync.rmSync> {
  return fsSync.rmSync(filePath, options);
}