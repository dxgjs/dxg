/**
 * Resolves a generator output declared in schema.prisma (relative to the
 * prisma/ directory, the way Prisma resolves it) into a project-root-
 * relative POSIX path. Returns undefined when the path escapes the root.
 */
export function resolveGeneratorOutput(declared: string): string | undefined {
  const segments = declared.replace(/\\/g, "/").split("/").filter((s) => s !== "");
  // Prisma resolves output relative to the schema file (prisma/), so the
  // resolution stack starts one level deep: ["prisma"]. Popping that base
  // lands at the project root; popping BELOW it escapes the project.
  const stack = ["prisma"];
  for (const seg of segments) {
    if (seg === ".") continue;
    if (seg === "..") {
      if (stack.length === 0) return undefined; // already outside the root
      stack.pop();
      continue;
    }
    stack.push(seg);
  }
  if (stack.length === 0) return undefined;
  return stack.join("/");
}

function dirnameSegments(filePath: string): string[] {
  const parts = filePath.split("/");
  parts.pop(); // drop the file name
  return parts.filter((s) => s !== "");
}

/**
 * Computes the ESM import specifier for the generated client, relative to
 * the helper file that imports it. Both inputs are project-root-relative
 * POSIX paths (the helper WITH its .ts extension, the output WITHOUT one).
 */
export function computeRelativeImport(
  fromFile: string,
  toPath: string,
): string {
  const fromDir = dirnameSegments(fromFile);
  const to = toPath.split("/").filter((s) => s !== "");
  let common = 0;
  while (
    common < fromDir.length &&
    common < to.length &&
    fromDir[common] === to[common]
  ) {
    common++;
  }
  const ups = fromDir.length - common;
  const rest = to.slice(common);
  const prefix = ups === 0 ? "./" : "../".repeat(ups);
  if (rest.length === 0) return `${prefix}client`;
  return `${prefix}${rest.join("/")}/client`;
}

/**
 * Computes a relative ESM import specifier from one FILE to another FILE
 * (both project-root-relative POSIX paths, both WITH their .ts extension
 * stripped by the caller). Unlike computeRelativeImport (directory-to-
 * generated-client), this targets an exact file: the seed imports the
 * helper, e.g. prisma/seed.ts -> lib/prisma.ts = "../lib/prisma".
 */
export function computeFileImport(
  fromFile: string,
  toFile: string,
): string {
  const fromDir = dirnameSegments(fromFile);
  const to = toFile.split("/").filter((s) => s !== "");
  let common = 0;
  while (
    common < fromDir.length &&
    common < to.length &&
    fromDir[common] === to[common]
  ) {
    common++;
  }
  const ups = fromDir.length - common;
  const rest = to.slice(common);
  const prefix = ups === 0 ? "./" : "../".repeat(ups);
  return `${prefix}${rest.join("/")}`;
}