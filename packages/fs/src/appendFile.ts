import { promises as fs } from 'fs';
import * as fsSync from 'fs';

type AppendFileOptions = Parameters<typeof fs.appendFile>[2];

export async function appendFile(
  filePath: Parameters<typeof fs.appendFile>[0],
  data: Parameters<typeof fs.appendFile>[1],
  options?: AppendFileOptions
): Promise<ReturnType<typeof fs.appendFile>> {
  return await fs.appendFile(filePath, data, options);
}

export function appendFileSync(
  filePath: Parameters<typeof fsSync.appendFileSync>[0],
  data: Parameters<typeof fsSync.appendFileSync>[1],
  options?: Parameters<typeof fsSync.appendFileSync>[2]
): ReturnType<typeof fsSync.appendFileSync> {
  return fsSync.appendFileSync(filePath, data, options);
}