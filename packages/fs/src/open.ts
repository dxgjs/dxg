import { promises as fs } from "fs";
import * as fsSync from "fs";

export type OpenOptions = Parameters<typeof fs.open>[1];

export async function open(
  path: Parameters<typeof fs.open>[0],
  flags: Parameters<typeof fs.open>[1],
  mode?: Parameters<typeof fs.open>[2],
): Promise<Awaited<ReturnType<typeof fs.open>>> {
  return fs.open(path, flags, mode);
}

export function openSync(
  path: Parameters<typeof fsSync.openSync>[0],
  flags: Parameters<typeof fsSync.openSync>[1],
  mode?: Parameters<typeof fsSync.openSync>[2],
): ReturnType<typeof fsSync.openSync> {
  return fsSync.openSync(path, flags, mode);
}