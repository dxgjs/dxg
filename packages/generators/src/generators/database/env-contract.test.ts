/**
 * Environment contract regression tests (audit families H):
 *
 *   H-1: the generated lib/prisma.ts helper must fail LOUDLY at import
 *        time when DATABASE_URL is missing. The historical template
 *        interpolated it — `` `${process.env.DATABASE_URL}` `` — so a
 *        missing variable became the literal string "undefined", which
 *        driver adapters accept silently (live-proven 2026-10-11: the
 *        better-sqlite3 adapter constructs without error on
 *        url="undefined") and only surfaces, confusingly, at first use.
 *        The guard tests ABSENCE (undefined), not emptiness: DXG itself
 *        writes "DATABASE_URL=" (empty placeholder) for server providers
 *        and the driver adapters are lazy, so the skeleton db:seed chain
 *        must run out-of-the-box on that state (live-proven
 *        2026-10-11: a falsy guard made `pnpm run db:seed` exit 1 on
 *        DXG's own fresh output; the postgres-seed e2e row locks this).
 *
 *   H-2: a .env that DXG itself created or appended must be gitignored.
 *        `prisma init` warns about it ("Don't forget to add .env in it
 *        to not commit any private information" — live-captured in the
 *        audit reference run) but never acts. DXG owns the DATABASE_URL
 *        declaration, so DXG closes the loop — additively, byte-
 *        preserving, and ONLY when it actually wrote the line: a
 *        user-owned .env that already had DATABASE_URL is left alone,
 *        and so is a .gitignore that already covers .env (including an
 *        explicit `!.env` negation — a deliberate user choice).
 */

import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  type Mock,
} from "vitest";
import { Logger } from "@dxgjs/logger";
import * as fs from "@dxgjs/fs";
import { render as realRender } from "@dxgjs/templates";
import { note as noteMock } from "@dxgjs/prompts";
import { createDependencyInstaller } from "../../install/installer";
import * as path from "path";
import * as os from "os";
import type { FSInterface, Generator } from "../../types";
import type { ProjectAwareness } from "@dxgjs/workspace";

type PackageJson = ProjectAwareness["packageJson"];

vi.mock("@dxgjs/prompts", async () => {
  const actual = await vi.importActual("@dxgjs/prompts");
  return {
    ...actual,
    prompt: vi.fn(),
    intro: vi.fn(),
    outro: vi.fn(),
    isCancel: vi.fn(),
    cancel: vi.fn(),
    spinner: vi.fn().mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
    }),
    note: vi.fn(),
  };
});

vi.mock("@dxgjs/fs", async () => {
  const actual = await vi.importActual<typeof import("@dxgjs/fs")>("@dxgjs/fs");
  // Same in-memory store contract as package-manifest.test.ts: the store is
  // captured in closures because several call sites invoke the fakes bare.
  const _files = new Map<string, string>();
  const _directories = new Set<string>();
  const _mock = {
    ...actual,
    _files,
    _directories,
    pathExists: vi.fn().mockImplementation(async (filePath: string) => {
      if (_files.has(filePath) || _directories.has(filePath)) {
        return true;
      }
      return actual.pathExists(filePath);
    }),
    readFile: vi.fn().mockImplementation(
      async (filePath: string, options?: unknown) => {
        if (_files.has(filePath)) {
          return _files.get(filePath);
        }
        return actual.readFile(
          filePath,
          options as Parameters<typeof actual.readFile>[1],
        );
      },
    ),
    writeFile: vi.fn().mockImplementation(
      async (filePath: string, data: string | Buffer) => {
        _files.set(filePath, data.toString());
        const dir = filePath.split("/").slice(0, -1).join("/");
        if (dir) {
          _directories.add(dir);
        }
        return undefined;
      },
    ),
    stat: vi.fn().mockImplementation(async (filePath: string) => {
      if (_files.has(filePath)) {
        return { isDirectory: () => false };
      }
      if (_directories.has(filePath)) {
        return { isDirectory: () => true };
      }
      return actual.stat(filePath);
    }),
    mkdir: vi.fn().mockImplementation(async (filePath: string) => {
      _directories.add(filePath);
      const parentDir = filePath.split("/").slice(0, -1).join("/");
      if (parentDir) {
        _directories.add(parentDir);
      }
      return undefined;
    }),
    readJson: vi.fn().mockImplementation(async (filePath: string) => {
      const content = _files.get(filePath);
      if (content !== undefined) {
        return JSON.parse(content);
      }
      return actual.readJson(filePath);
    }),
    writeJson: vi.fn().mockImplementation(
      async (
        filePath: string,
        data: unknown,
        options?: { spaces?: number },
      ) => {
        _files.set(
          filePath,
          JSON.stringify(data, null, options?.spaces ?? 2),
        );
        return undefined;
      },
    ),
    executeCommand: vi.fn().mockImplementation(
      async (command: string, args: string[] = []) => {
        if (command === "npm" && args[0] === "install") {
          const dev = args[1] === "-D";
          const packages = dev ? args.slice(2) : args.slice(1);
          const manifest = JSON.parse(
            _files.get("package.json") ?? "{}",
          ) as PackageJson;
          const section = dev
            ? (manifest.devDependencies ??= {})
            : (manifest.dependencies ??= {});
          for (const spec of packages) {
            const at = spec.lastIndexOf("@");
            const name = at > 0 ? spec.slice(0, at) : spec;
            section[name] = at > 0 ? spec.slice(at + 1) : "*";
          }
          _files.set("package.json", JSON.stringify(manifest, null, 2));
          if (
            packages.some(
              (spec: string) =>
                spec === "better-sqlite3" || spec.startsWith("better-sqlite3@"),
            )
          ) {
            _files.set(
              "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
              "<binary>",
            );
          }
        }
        if (
          command === "npx" &&
          args[0] === "prisma@7" &&
          args[1] === "init" &&
          !_files.has("prisma/schema.prisma")
        ) {
          _files.set(
            "prisma/schema.prisma",
            "generator client {\n  output = \"../lib/generated/prisma\"\n}\n",
          );
          _directories.add("prisma");
        }
        if (
          command === "npx" &&
          args[0] === "prisma@7" &&
          args[1] === "generate"
        ) {
          _files.set(
            "lib/generated/prisma/client.ts",
            "// generated prisma client\n",
          );
          _directories.add("lib/generated/prisma");
          return { all: "prisma generate ok", stdout: "", stderr: "" };
        }
        return { all: "", stdout: "", stderr: "" };
      },
    ),
  };
  return _mock;
});

vi.mock("@antfu/ni", () => {
  return {
    parseNi: vi.fn().mockReturnValue("npm"),
    parseNlx: vi.fn().mockReturnValue("npx"),
    getCliCommand: vi
      .fn()
      .mockImplementation(async (_parseFn: unknown, args: string[]) => {
        if (!args || args.length === 0) {
          return { command: "npm", args: [] };
        }
        if (args[0] === "prisma@7") {
          return { command: "npx", args: [...args] };
        }
        if (args[0] === "-D") {
          return { command: "npm", args: ["install", "-D", ...args.slice(1)] };
        }
        return { command: "npm", args: ["install", ...args] };
      }),
  };
});

vi.mock("@dxgjs/templates", async () => {
  const actual =
    await vi.importActual<typeof import("@dxgjs/templates")>("@dxgjs/templates");
  return {
    ...actual,
    render: vi.fn(actual.render),
  };
});

let databaseGenerator: Generator;

beforeAll(async () => {
  const indexModule = await import("./index");
  databaseGenerator = indexModule.default;
});

const fsMockStore = fs as unknown as {
  _files: Map<string, string>;
  _directories: Set<string>;
};

const MY_APP_PACKAGE_JSON = {
  name: "my-app",
  version: "0.1.0",
  private: true,
  scripts: {
    dev: "next dev",
    build: "next build",
    start: "next start",
    lint: "eslint",
  },
  dependencies: {
    next: "16.2.12",
    react: "19.2.4",
    "react-dom": "19.2.4",
  },
  devDependencies: {
    typescript: "^5",
  },
};

async function seedProject(manifest: unknown = MY_APP_PACKAGE_JSON) {
  await fs.writeFile("package.json", JSON.stringify(manifest, null, 2), "utf8");
}

function makeContext(
  manifest: unknown = MY_APP_PACKAGE_JSON,
  overrides: Record<string, unknown> = {},
) {
  return {
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger,
    fs,
    templates: {
      render: vi.fn(realRender),
    },
    awareness: {
      projectRoot: ".",
      workspaceRoot: ".",
      framework: { name: "next-app" as const, detected: true },
      language: { name: "typescript" as const, detected: true },
      packageManager: "pnpm",
      styling: {
        name: "tailwindcss" as const,
        detected: true,
        version: "v4" as const,
        configFile: null,
      },
      capabilities: {
        hasTests: false,
        hasLinting: true,
        hasFormatter: false,
        hasCI: false,
        hasDocker: false,
      },
      packageJson: JSON.parse(JSON.stringify(manifest)),
    },
    installer: createDependencyInstaller({ agent: "npm", fs: fs as FSInterface }),
    dryRun: false,
    force: false,
    ...overrides,
  };
}

function notes(): string[] {
  return (noteMock as Mock).mock.calls.map((call) => String(call[0]));
}

/** The single Operation Summary of the latest run (see package-manifest.test.ts). */
function operationSummary(runs = 1): string {
  const summaryNotes = notes();
  expect(summaryNotes.length).toBe(runs);
  return summaryNotes[runs - 1];
}

const ANSWERS = {
  installPrismaSkills: false,
  databaseScripts: "recommended",
  helperPath: "lib/prisma.ts",
};

describe("environment contract (DATABASE_URL guard + .env gitignore)", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = path.join(
      os.tmpdir(),
      `dxg-env-contract-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 15)}`,
    );
    fs.mkdirSync(tempDir, { recursive: true });
    process.chdir(tempDir);
    vi.clearAllMocks();
    fsMockStore._files.clear();
    fsMockStore._directories.clear();
    await seedProject();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("H-1: the helper fails loudly when DATABASE_URL is missing", () => {
    // Every provider on the "connectionString" instantiation pattern
    // (providerData.instantiationPattern) reads DATABASE_URL — the
    // individualParams providers (mysql, sqlserver) use other vars and
    // are out of scope for this contract.
    test.each(["sqlite", "postgresql", "cockroachdb", "planetscale", "prismapostgres"])(
      "%s helper guards instead of coercing the literal string \"undefined\"",
      async (provider) => {
        await databaseGenerator.run({ ...ANSWERS, provider }, makeContext());

        const helper = fsMockStore._files.get("lib/prisma.ts");
        expect(helper).toBeDefined();
        // The silent coercion is gone: no template-literal interpolation
        // of a possibly-undefined env var into the connection string.
        expect(helper).not.toMatch(/\$\{process\.env\.DATABASE_URL\}/);
        expect(helper).not.toMatch(/url: process\.env\.DATABASE_URL/);
        // Direct, guarded read instead...
        expect(helper).toContain(
          "const connectionString = process.env.DATABASE_URL;",
        );
        expect(helper).toMatch(/if \(connectionString === undefined\)\s*\{/);
        expect(helper).not.toMatch(/if \(!connectionString\)/);
        // ...that throws a message naming the missing variable.
        expect(helper).toMatch(/throw new Error\(/);
        expect(helper).toContain("DATABASE_URL is not set");
      },
    );
  });

  describe("H-2: a .env DXG writes is gitignored", () => {
    test("DXG-created .env gets .gitignore coverage (created when absent)", async () => {
      // Fresh project: neither .env nor .gitignore exists.
      expect(fsMockStore._files.has(".env")).toBe(false);

      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const gitignore = fsMockStore._files.get(".gitignore");
      expect(gitignore).toBeDefined();
      expect(gitignore).toMatch(/(^|\n)\.env(\r?\n|$)/);
      expect(operationSummary()).toContain(".gitignore");
    });

    test("an existing .gitignore is appended byte-preservingly", async () => {
      const existing = "node_modules/\n\n# custom section\n";
      await fs.writeFile(".gitignore", existing, "utf8");

      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const gitignore = fsMockStore._files.get(".gitignore");
      // Original bytes first, untouched; the .env line appended after.
      expect(gitignore).toBe(`${existing}.env\n`);
    });

    test.each([".env", ".env*", "*.env"])(
      "a .gitignore already covering .env (%s) is left untouched",
      async (spelling) => {
        const existing = `node_modules/\n${spelling}\n`;
        await fs.writeFile(".gitignore", existing, "utf8");

        await databaseGenerator.run(
          { ...ANSWERS, provider: "postgresql" },
          makeContext(),
        );

        expect(fsMockStore._files.get(".gitignore")).toBe(existing);
      },
    );

    test('".env.*" should provoke an append (".env" added after the line)', async () => {
      const existing = "node_modules/\n.env.*\n";
      await fs.writeFile(".gitignore", existing, "utf8");

      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      expect(fsMockStore._files.get(".gitignore")).toBe("node_modules/\n.env.*\n.env\n");
    });

    test('"  .env" (leading space) should provoke an append (".env" added after the line)', async () => {
      const existing = "node_modules/\n  .env\n";
      await fs.writeFile(".gitignore", existing, "utf8");

      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      expect(fsMockStore._files.get(".gitignore")).toBe("node_modules/\n  .env\n.env\n");
    });

    test('".env " (trailing space) should be left intact (already covered)', async () => {
      const existing = "node_modules/\n.env \n";
      await fs.writeFile(".gitignore", existing, "utf8");

      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      expect(fsMockStore._files.get(".gitignore")).toBe(existing);
    });

    test("an explicit !.env negation is respected (user tracks .env deliberately)", async () => {
      const existing = "node_modules/\n!.env\n";
      await fs.writeFile(".gitignore", existing, "utf8");

      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      expect(fsMockStore._files.get(".gitignore")).toBe(existing);
    });

    test("rerun after DATABASE_URL landed: .gitignore is not touched again", async () => {
      const context = makeContext();
      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        context,
      );
      const afterFirstRun = fsMockStore._files.get(".gitignore");

      await databaseGenerator.run({ ...ANSWERS, provider: "postgresql" }, context);

      // Byte-stable across reruns: the second run finds DATABASE_URL
      // already declared and never re-enters the .env/.gitignore path.
      expect(fsMockStore._files.get(".gitignore")).toBe(afterFirstRun);
      const lines = (fsMockStore._files.get(".gitignore") ?? "").split("\n");
      expect(lines.filter((l) => l.trim() === ".env")).toHaveLength(1);
    });

    test("a user-owned .env that already declares DATABASE_URL touches neither file", async () => {
      const userEnv = "# my secrets\nDATABASE_URL=postgresql://user:pw@localhost:5432/db\n";
      await fs.writeFile(".env", userEnv, "utf8");
      expect(fsMockStore._files.has(".gitignore")).toBe(false);

      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      // DXG did not write .env this run → .gitignore is none of its
      // business either (the user owns the hygiene decision here).
      expect(fsMockStore._files.get(".env")).toBe(userEnv);
      expect(fsMockStore._files.has(".gitignore")).toBe(false);
    });
  });
});

describe("security/secret leakage prevention", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = path.join(
      os.tmpdir(),
      `dxg-secret-leakage-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 15)}`,
    );
    fs.mkdirSync(tempDir, { recursive: true });
    process.chdir(tempDir);
    vi.clearAllMocks();
    fsMockStore._files.clear();
    fsMockStore._directories.clear();
    await seedProject();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe(".gitignore coverage and git status", () => {
    test("fresh run creates .gitignore with .env entry when neither exists", async () => {
      // Precondition: neither .env nor .gitignore exists
      expect(fsMockStore._files.has(".env")).toBe(false);
      expect(fsMockStore._files.has(".gitignore")).toBe(false);

      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      // Verify .gitignore was created and contains .env
      const gitignore = fsMockStore._files.get(".gitignore");
      expect(gitignore).toBeDefined();
      expect(gitignore).toMatch(/(^|\n)\.env(\r?\n|$)/);
    });

    test("fresh run appends .env to existing .gitignore", async () => {
      const existingGitignore = "node_modules/\ndist/\n";
      await fs.writeFile(".gitignore", existingGitignore, "utf8");

      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const gitignore = fsMockStore._files.get(".gitignore");
      expect(gitignore).toBe(`${existingGitignore}.env\n`);
    });

    test("git status would show .env as ignored (simulated via .gitignore content)", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const gitignore = fsMockStore._files.get(".gitignore") ?? "";
      const lines = gitignore.split(/\r?\n/).map((l) => l.trimEnd());
      const hasEnvIgnore = lines.some((line) =>
        [".env", ".env*", "*.env"].includes(line),
      );
      expect(hasEnvIgnore).toBe(true);

      // The .env file should exist (written by DXG)
      const envContent = fsMockStore._files.get(".env");
      expect(envContent).toBeDefined();
      expect(envContent).toContain("DATABASE_URL");
    });
  });

  describe("DATABASE_URL placeholders contain no real credentials", () => {
    test("server providers get empty DATABASE_URL placeholder", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const envContent = fsMockStore._files.get(".env") ?? "";
      // Server providers get empty placeholder: DATABASE_URL=
      expect(envContent).toContain("DATABASE_URL=");
      // Should NOT contain real connection strings
      expect(envContent).not.toMatch(/DATABASE_URL=postgresql:\/\//);
      expect(envContent).not.toMatch(/DATABASE_URL=mysql:\/\//);
      expect(envContent).not.toMatch(/DATABASE_URL=cockroachdb:\/\//);
      expect(envContent).not.toMatch(/DATABASE_URL=.*:\/\/.*:.*@/); // No credentials in URL
    });

    test("sqlite gets file: URL placeholder (not real credentials)", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "sqlite" },
        makeContext(),
      );

      const envContent = fsMockStore._files.get(".env") ?? "";
      // SQLite gets a local file URL
      expect(envContent).toContain('DATABASE_URL="file:./dev.db"');
      // Should not contain remote URLs or credentials
      expect(envContent).not.toMatch(/DATABASE_URL=postgresql:\/\//);
      expect(envContent).not.toMatch(/DATABASE_URL=.*:\/\/.*:.*@/);
    });

    test("planetscale gets empty placeholder (server provider)", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "planetscale" },
        makeContext(),
      );

      const envContent = fsMockStore._files.get(".env") ?? "";
      expect(envContent).toContain("DATABASE_URL=");
      expect(envContent).not.toMatch(/DATABASE_URL=.*:\/\/.*:.*@/);
    });

    test("prismapostgres gets empty placeholder (server provider)", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "prismapostgres" },
        makeContext(),
      );

      const envContent = fsMockStore._files.get(".env") ?? "";
      expect(envContent).toContain("DATABASE_URL=");
      expect(envContent).not.toMatch(/DATABASE_URL=.*:\/\/.*:.*@/);
    });

    test("cockroachdb gets empty placeholder (server provider)", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "cockroachdb" },
        makeContext(),
      );

      const envContent = fsMockStore._files.get(".env") ?? "";
      expect(envContent).toContain("DATABASE_URL=");
      expect(envContent).not.toMatch(/DATABASE_URL=.*:\/\/.*:.*@/);
    });

    test("user-owned .env with real DATABASE_URL is never modified", async () => {
      // User already has a .env with real credentials
      const userEnv = "DATABASE_URL=postgresql://realuser:realpass@prod.db:5432/proddb\n";
      await fs.writeFile(".env", userEnv, "utf8");

      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      // DXG must NOT touch user's .env when it already has DATABASE_URL
      const envContent = fsMockStore._files.get(".env");
      expect(envContent).toBe(userEnv);
    });
  });

  describe("generated prisma client lib does not leak secrets", () => {
    test("helper template has no hardcoded credentials", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const helper = fsMockStore._files.get("lib/prisma.ts");
      expect(helper).toBeDefined();

      // Must read from process.env.DATABASE_URL, not hardcode anything
      expect(helper).toContain("const connectionString = process.env.DATABASE_URL;");
      // No literal connection strings
      expect(helper).not.toMatch(/postgresql:\/\//);
      expect(helper).not.toMatch(/mysql:\/\//);
      expect(helper).not.toMatch(/mongodb:\/\//);
      expect(helper).not.toMatch(/redis:\/\//);
      // No credentials in any form - more specific patterns to avoid false positives
      // AWS access key: AKIA followed by 16 alphanumerics
      expect(helper).not.toMatch(/AKIA[0-9A-Z]{16}/);
      // AWS secret: 40 chars base64
      expect(helper).not.toMatch(/[A-Za-z0-9/+=]{40}/);
      // Generic long base64 strings (likely secrets) - 32+ chars with padding
      expect(helper).not.toMatch(/[A-Za-z0-9+/]{32,}={0,2}/);
      // Hex secrets (32+ chars = 128+ bits)
      expect(helper).not.toMatch(/[a-f0-9]{32,}/);
    });

    test("helper has no template literal interpolation of DATABASE_URL", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const helper = fsMockStore._files.get("lib/prisma.ts");
      expect(helper).toBeDefined();

      // The old bug: template literal `${process.env.DATABASE_URL}` which
      // becomes the literal string "undefined" when missing
      expect(helper).not.toMatch(/\$\{process\.env\.DATABASE_URL\}/);
      expect(helper).not.toMatch(/url:\s*process\.env\.DATABASE_URL/);
      // Must use direct guarded read
      expect(helper).toContain("const connectionString = process.env.DATABASE_URL;");
      expect(helper).toMatch(/if \(connectionString === undefined\)\s*\{/);
    });

    test("helper throws descriptive error on missing DATABASE_URL", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const helper = fsMockStore._files.get("lib/prisma.ts");
      expect(helper).toBeDefined();

      expect(helper).toMatch(/throw new Error\(/);
      expect(helper).toContain("DATABASE_URL is not set");
    });

    test("all provider templates use the same guard pattern", async () => {
      const connectionStringProviders = [
        "postgresql",
        "sqlite",
        "cockroachdb",
        "planetscale",
        "prismapostgres",
      ];

      for (const provider of connectionStringProviders) {
        vi.clearAllMocks();
        fsMockStore._files.clear();
        fsMockStore._directories.clear();
        await seedProject(); // Re-seed package.json for each iteration

        await databaseGenerator.run(
          { ...ANSWERS, provider },
          makeContext(),
        );

        const helper = fsMockStore._files.get("lib/prisma.ts");
        expect(helper).toBeDefined();
        expect(helper).toContain("const connectionString = process.env.DATABASE_URL;");
        expect(helper).toMatch(/if \(connectionString === undefined\)\s*\{/);
        expect(helper).toContain("DATABASE_URL is not set");
      }
    });
  });

  describe("secret scanning patterns", () => {
    test("no AWS keys in generated files", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const helper = fsMockStore._files.get("lib/prisma.ts") ?? "";
      const envContent = fsMockStore._files.get(".env") ?? "";
      const allContent = helper + envContent;

      // AWS access key pattern
      expect(allContent).not.toMatch(/AKIA[0-9A-Z]{16}/);
      // AWS secret key pattern
      expect(allContent).not.toMatch(/[A-Za-z0-9/+=]{40}/);
    });

    test("no GitHub tokens in generated files", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const helper = fsMockStore._files.get("lib/prisma.ts") ?? "";
      const envContent = fsMockStore._files.get(".env") ?? "";
      const allContent = helper + envContent;

      // GitHub token patterns
      expect(allContent).not.toMatch(/gh[pousr]_[A-Za-z0-9_]{36,}/);
      expect(allContent).not.toMatch(/github_pat_[A-Za-z0-9_]{82,}/);
    });

    test("no generic API keys in generated files", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const helper = fsMockStore._files.get("lib/prisma.ts") ?? "";
      const envContent = fsMockStore._files.get(".env") ?? "";
      const allContent = helper + envContent;

      // Generic API key patterns (common prefixes)
      expect(allContent).not.toMatch(/api[_-]?key["\s:=]+[A-Za-z0-9_-]{20,}/i);
      expect(allContent).not.toMatch(/secret[_-]?key["\s:=]+[A-Za-z0-9_-]{20,}/i);
      expect(allContent).not.toMatch(/access[_-]?token["\s:=]+[A-Za-z0-9_-]{20,}/i);
    });

    test("no private keys in generated files", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const helper = fsMockStore._files.get("lib/prisma.ts") ?? "";
      const envContent = fsMockStore._files.get(".env") ?? "";
      const allContent = helper + envContent;

      // Private key patterns
      expect(allContent).not.toMatch(/-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/);
      expect(allContent).not.toMatch(/-----BEGIN CERTIFICATE-----/);
    });

    test("no database connection strings with embedded credentials in generated files", async () => {
      await databaseGenerator.run(
        { ...ANSWERS, provider: "postgresql" },
        makeContext(),
      );

      const helper = fsMockStore._files.get("lib/prisma.ts") ?? "";
      const envContent = fsMockStore._files.get(".env") ?? "";
      const allContent = helper + envContent;

      // Connection strings with user:pass@host pattern
      expect(allContent).not.toMatch(/[a-zA-Z]+:\/\/[^:]+:[^@]+@/);
      // MongoDB connection strings
      expect(allContent).not.toMatch(/mongodb\+srv:\/\/[^:]+:[^@]+@/);
      // Redis connection strings
      expect(allContent).not.toMatch(/redis:\/\/[^:]+:[^@]+@/);
    });
  });
});
