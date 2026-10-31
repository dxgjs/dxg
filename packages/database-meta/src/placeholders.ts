/**
 * Per-provider DATABASE_URL placeholders.
 * SQLite gets a working file URL so the recommended chain works out-of-the-box.
 * Server providers get empty string — user must fill in their connection string.
 */
export const providerPlaceholders: Record<string, string> = {
  sqlite: "file:./dev.db",
  postgresql: "",
  mysql: "",
  sqlserver: "",
  cockroachdb: "",
  planetscale: "",
  prismapostgres: "",
};