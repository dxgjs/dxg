/** Legacy (<=6) datasource form: `url = env("...")` inside the datasource block. */
export function schemaHasLegacyDatasource(schemaText: string): boolean {
  return /datasource\s+\w+\s*\{[^}]*url\s*=\s*env\(/s.test(schemaText);
}

/**
 * Extracts the `generator client { ... output = "..." }` block's output path
 * from schema.prisma text. Returns:
 * - { present: true, output } on success
 * - { present: true, output: undefined } when a generator block exists but
 *   its output cannot be parsed (generate will fail loudly on its own —
 *   verified: "An output path is required for the `prisma-client` generator")
 * - { present: false } when there is no generator block at all (generate
 *   exits 0 having generated NOTHING — the false-success case).
 */
export function parseGeneratorOutput(
  schemaText: string,
): { present: boolean; output?: string } {
  const block = /generator\s+client\s*\{([\s\S]*?)\}/.exec(schemaText);
  if (!block) return { present: false };
  const output = /^\s*output\s*=\s*"([^"]+)"/m.exec(block[1]);
  return { present: true, output: output?.[1] };
}