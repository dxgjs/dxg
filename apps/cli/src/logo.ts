import pc from "picocolors";

const RESET = "\x1b[0m";
// 256-color grays: readable on both light and dark terminal backgrounds.
const DIM = "\x1b[38;5;102m"; // secondary text
const TEXT = "\x1b[38;5;145m"; // primary text

/** "DXG" in the ANSI Shadow block font. Every line has the same width. */
export const LOGO_LINES = [
  "██████╗ ██╗  ██╗ ██████╗ ",
  "██╔══██╗╚██╗██╔╝██╔════╝ ",
  "██║  ██║ ╚███╔╝ ██║  ███╗",
  "██║  ██║ ██╔██╗ ██║   ██║",
  "██████╔╝██╔╝ ██╗╚██████╔╝",
  "╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ",
] as const;

// One gray per logo line, from light (top) to dark (bottom).
const GRAYS = [
  "\x1b[38;5;250m",
  "\x1b[38;5;248m",
  "\x1b[38;5;245m",
  "\x1b[38;5;243m",
  "\x1b[38;5;240m",
  "\x1b[38;5;238m",
] as const;

const TAGLINE = "Generate project scaffolding";

const BANNER_COMMANDS = [
  { command: "dxg add db", description: "Set up a database with Prisma ORM" },
  { command: "dxg doctor", description: "Diagnose your DXG project" },
  { command: "dxg doctor --fix", description: "Repair what can be repaired" },
] as const;

export interface LogoOptions {
  /** Output is machine-readable (e.g. `--json`): never print the logo. */
  json?: boolean;
  /** Whether stdout is an interactive terminal. Defaults to the real stdout. */
  isTTY?: boolean;
  /** Environment to inspect. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

function isCI(env: NodeJS.ProcessEnv): boolean {
  const value = env.CI;
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

/**
 * The logo is decoration for humans: it is only shown in an interactive
 * terminal. It is skipped when output is piped or redirected (scripts, `| jq`),
 * in CI, and when the command produces machine-readable output.
 */
export function shouldShowLogo({
  json = false,
  isTTY = Boolean(process.stdout.isTTY),
  env = process.env,
}: LogoOptions = {}): boolean {
  if (json) return false;
  if (!isTTY) return false;
  if (isCI(env)) return false;
  return true;
}

/** The logo as printable lines, in color when the terminal supports it. */
export function renderLogo(colors: boolean = pc.isColorSupported): string[] {
  return LOGO_LINES.map((line, i) =>
    colors ? `${GRAYS[i]}${line.trimEnd()}${RESET}` : line.trimEnd(),
  );
}

/** The welcome banner shown by `dxg` without arguments. */
export function renderBanner(
  version: string,
  colors: boolean = pc.isColorSupported,
): string {
  const dim = (text: string): string => (colors ? `${DIM}${text}${RESET}` : text);
  const main = (text: string): string => (colors ? `${TEXT}${text}${RESET}` : text);
  const width = Math.max(...BANNER_COMMANDS.map((c) => c.command.length));

  const lines = [
    "",
    ...renderLogo(colors),
    "",
    `${dim(TAGLINE)} ${dim(`v${version}`)}`,
    "",
    ...BANNER_COMMANDS.map(
      ({ command, description }) =>
        ` ${dim("$")} ${main(command.padEnd(width))}  ${dim(description)}`,
    ),
    "",
    `${dim("try:")} npx @dxgjs/cli add db`,
    "",
    `Docs and source: ${main("https://github.com/dxgjs/dxg")}`,
    "",
  ];

  return lines.join("\n");
}

/** Prints the logo, followed by a blank line. */
export function showLogo(): void {
  console.log();
  for (const line of renderLogo()) console.log(line);
  console.log();
}

/** Prints the welcome banner. */
export function showBanner(version: string): void {
  console.log(renderBanner(version));
}
