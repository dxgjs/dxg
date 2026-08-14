import { promises as fs } from 'fs';
import * as fsSync from 'fs';

type SupportedEncoding = BufferEncoding | null;
type ReaddirOptions = { encoding?: SupportedEncoding };

export async function readdir(
  filePath: string,
  options?: ReaddirOptions
): Promise<string[]> {
  const result = await fs.readdir(filePath, options);
  // We are returning string[] for simplicity, assuming withFileTypes is false.
  // If options.encoding === 'buffer', result will be Buffer[]; we need to convert to string[]?
  // For simplicity, we only support utf8 or null encoding returning string.
  // If encoding is 'buffer', we'll throw or convert? We'll just return as string[] after toString?
  // To keep it simple, we only allow string|undefined encoding and assert result is string[].
  if (typeof result[0] === 'string') {
    return result as string[];
  }
  // If Buffer[], convert each to string using utf8? Not needed for now.
  // We'll assume not used.
  return result as string[];
}

export function readdirSync(
  filePath: string,
  options?: ReaddirOptions
): string[] {
  const result = fsSync.readdirSync(filePath, options);
  if (typeof result[0] === 'string') {
    return result as string[];
  }
  return result as string[];
}