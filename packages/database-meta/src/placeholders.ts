/**
 * Per-provider DATABASE_URL placeholders.
 * SQLite gets a working file URL so the recommended chain works out-of-the-box.
 * Server providers get a template the user can edit (or skip via opt-in prompt).
 */
export const providerPlaceholders: Record<string, string> = {
  sqlite: "file:./dev.db",
  postgresql: "postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public",
  mysql: "mysql://USER:PASSWORD@HOST:3306/DATABASE",
  sqlserver: "sqlserver://USER:PASSWORD@HOST:1433;database=DATABASE",
  cockroachdb: "postgresql://USER:PASSWORD@HOST:26257/DATABASE?sslmode=require",
  planetscale: "mysql://USER:PASSWORD@HOST:3306/DATABASE?sslaccept=strict",
  prismapostgres: "postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require",
};