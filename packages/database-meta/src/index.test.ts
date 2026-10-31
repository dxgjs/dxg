import { describe, it, expect } from "vitest";
import * as meta from "./index";

describe("@dxgjs/database-meta exports", () => {
  it("exports provider data and utilities", () => {
    expect(meta.providerData).toBeDefined();
    expect(meta.SUPPORTED_PROVIDERS).toBeDefined();
    expect(meta.getProviderData).toBeDefined();
    expect(meta.isSupportedProvider).toBeDefined();
  });

  it("exports script catalog and functions", () => {
    expect(meta.databaseScriptCatalog).toBeDefined();
    expect(meta.SEED_SCRIPT_NAME).toBe("db:seed");
    expect(meta.providerScripts).toBeDefined();
    expect(meta.recommendedScripts).toBeDefined();
    expect(meta.resolveDatabaseScripts).toBeDefined();
  });

  it("exports path constants", () => {
    expect(meta.PRISMA_CONFIG_PATH).toBe("prisma7.config.ts");
    expect(meta.SCHEMA_PATH).toBe("prisma/schema.prisma");
    expect(meta.ENV_PATH).toBe(".env");
    expect(meta.DEFAULT_GENERATOR_OUTPUT).toBeDefined();
    expect(meta.DEFAULT_HELPER_PATH).toBeDefined();
  });

  it("exports Prisma version and args", () => {
    expect(meta.PRISMA_PINNED_VERSION).toBe("7.10.0");
    expect(meta.buildPrismaInitArgs).toBeDefined();
  });

  it("exports import path computation", () => {
    expect(meta.resolveGeneratorOutput).toBeDefined();
    expect(meta.computeRelativeImport).toBeDefined();
    expect(meta.computeFileImport).toBeDefined();
  });

  it("exports helper path functions", () => {
    expect(meta.normalizeHelperPath).toBeDefined();
    expect(meta.validateHelperPath).toBeDefined();
    expect(meta.isValidPrismaClientHelper).toBeDefined();
  });

  it("exports provider detection functions", () => {
    expect(meta.normalizePrismaProvider).toBeDefined();
    expect(meta.extractProviderFromSchema).toBeDefined();
    expect(meta.extractProviderFromConfig).toBeDefined();
    expect(meta.providersMatch).toBeDefined();
  });

  it("exports version classification functions", () => {
    expect(meta.parseVersion).toBeDefined();
    expect(meta.classifyPrismaVersion).toBeDefined();
    expect(meta.declaredVersion).toBeDefined();
    expect(meta.specName).toBeDefined();
  });

  it("exports schema utilities", () => {
    expect(meta.schemaHasLegacyDatasource).toBeDefined();
    expect(meta.parseGeneratorOutput).toBeDefined();
  });

  it("exports placeholders", () => {
    expect(meta.providerPlaceholders).toBeDefined();
  });

  it("exports utils", () => {
    expect(meta.normalizeContent).toBeDefined();
    expect(meta.sanitizeEnvValue).toBeDefined();
    expect(meta.validateDatabase).toBeDefined();
  });

  it("exports types", () => {
    // Type-only exports - just verify the module compiles
    expect(true).toBe(true);
  });
});