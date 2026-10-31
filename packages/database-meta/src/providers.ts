import { fileURLToPath } from "url";
import { dirname, join, sep } from "path";
import type { ProviderData } from "./types";
export type { ProviderData } from "./types";

// Get the directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine if we're in a bundled context (where __dirname points to dist/)
// In bundled context, we need to adjust the path to point to generators/database/templates/
const isBundled =
  __dirname.endsWith(`${sep}dist`) || __dirname.endsWith("/dist");
let templateBasePath: string;
if (isBundled) {
  // In bundle, templates are under database-meta/templates/
  templateBasePath = join(__dirname, "templates");
} else {
  // In source, templates are under the package's templates/
  templateBasePath = join(__dirname, "..", "..", "generators", "database", "templates");
}

// Provider data — explicit and data-driven as required
export const providerData: Record<string, ProviderData> = {
  sqlite: {
    key: "sqlite",
    name: "SQLite",
    displayName: "SQLite",
    prismaProvider: "sqlite",
    adapterPackage: "@prisma/adapter-better-sqlite3",
    adapterImport: "PrismaBetterSqlite3",
    adapterClass: "PrismaBetterSqlite3",
    driverPackage: "better-sqlite3",
    devDependencies: ["prisma@7.10.0", "@types/node", "@types/better-sqlite3"],
    // better-sqlite3 is PINNED to ^12.6.0: @prisma/adapter-better-sqlite3@7.10.0
    // requires ^12.6.0, and latest (13.x) changed distribution models (no
    // install script at all). Unpinned, the two constraints could diverge
    // into a double-copy hazard.
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-better-sqlite3",
      "better-sqlite3@^12.6.0",
      "dotenv",
    ],
    templatePath: join(templateBasePath, "prisma-client-lib-sqlite.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes:
      "SQLite is a file-based database suited for development and prototyping.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
  postgresql: {
    key: "postgresql",
    name: "PostgreSQL",
    displayName: "PostgreSQL",
    prismaProvider: "postgresql",
    adapterPackage: "@prisma/adapter-pg",
    adapterImport: "PrismaPg",
    adapterClass: "PrismaPg",
    driverPackage: "pg",
    devDependencies: ["prisma@7.10.0", "@types/node", "@types/pg"],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-pg",
      "pg",
      "dotenv",
    ],
    templatePath: join(templateBasePath, "prisma-client-lib.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes:
      "PostgreSQL is a powerful, open source object-relational database system.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
  mysql: {
    key: "mysql",
    name: "MySQL",
    displayName: "MySQL",
    prismaProvider: "mysql",
    adapterPackage: "@prisma/adapter-mariadb",
    adapterImport: "PrismaMariaDb",
    adapterClass: "PrismaMariaDb",
    driverPackage: "", // MariaDB adapter uses individual params, not a driver package
    devDependencies: ["prisma@7.10.0", "@types/node"],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-mariadb",
      "dotenv",
    ],
    templatePath: join(templateBasePath, "prisma-client-lib-mysql.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "individualParams", // Uses individual connection parameters
    notes:
      "MySQL is a widely-used open source relational database management system.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
  sqlserver: {
    key: "sqlserver",
    name: "SQL Server",
    displayName: "SQL Server",
    prismaProvider: "sqlserver",
    adapterPackage: "@prisma/adapter-mssql",
    adapterImport: "PrismaMssql",
    adapterClass: "PrismaMssql",
    driverPackage: "", // MSSQL adapter uses individual params
    devDependencies: ["prisma@7.10.0", "@types/node", "@types/mssql"],
    dependencies: ["@prisma/client@7.10.0", "@prisma/adapter-mssql", "dotenv"],
    templatePath: join(templateBasePath, "prisma-client-lib-sqlserver.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "individualParams", // Uses individual connection parameters
    notes:
      "Microsoft SQL Server is a relational database management system developed by Microsoft.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
  cockroachdb: {
    key: "cockroachdb",
    name: "CockroachDB",
    displayName: "CockroachDB",
    prismaProvider: "cockroachdb",
    adapterPackage: "@prisma/adapter-pg",
    adapterImport: "PrismaPg",
    adapterClass: "PrismaPg",
    driverPackage: "pg",
    devDependencies: ["prisma@7.10.0", "@types/node", "@types/pg"],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-pg",
      "pg",
      "dotenv",
    ],
    templatePath: join(templateBasePath, "prisma-client-lib.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes:
      "CockroachDB is a distributed SQL database built on a transactional and strongly-consistent key-value store.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
  planetscale: {
    key: "planetscale",
    name: "PlanetScale",
    displayName: "PlanetScale (MySQL)",
    prismaProvider: "mysql", // Uses MySQL protocol
    adapterPackage: "@prisma/adapter-planetscale",
    adapterImport: "PrismaPlanetScale",
    adapterClass: "PrismaPlanetScale",
    driverPackage: "undici", // Required for fetch polyfill
    devDependencies: ["prisma@7.10.0", "@types/node"],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-planetscale",
      "undici",
      "dotenv",
    ],
    templatePath: join(templateBasePath, "prisma-client-lib-planetscale.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    // Prisma migrations (migrate dev/reset) are unsupported on Vitess:
    // schema changes go through PlanetScale's own workflow instead.
    supportsMigrations: false,
    notes:
      "PlanetScale is a serverless database platform built on Vitess. Requires relationMode = 'prisma' in schema.prisma for MySQL variant.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
  prismapostgres: {
    key: "prismapostgres",
    name: "Prisma Postgres",
    displayName: "Prisma Postgres",
    prismaProvider: "postgresql", // Uses PostgreSQL provider
    adapterPackage: "@prisma/adapter-pg",
    adapterImport: "PrismaPg",
    adapterClass: "PrismaPg",
    driverPackage: "pg",
    devDependencies: ["prisma@7.10.0", "@types/node", "@types/pg"],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-pg",
      "pg",
      "dotenv",
    ],
    templatePath: join(templateBasePath, "prisma-client-lib.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes:
      "Prisma Postgres is a fully managed PostgreSQL-compatible database service.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
};

/** All supported provider keys. */
export const SUPPORTED_PROVIDERS = Object.keys(providerData) as Array<keyof typeof providerData>;

/** Get provider data by key, or undefined if not supported. */
export function getProviderData(key: string): ProviderData | undefined {
  return providerData[key as keyof typeof providerData];
}

/** Check if a provider key is supported. */
export function isSupportedProvider(key: string): boolean {
  return key in providerData;
}