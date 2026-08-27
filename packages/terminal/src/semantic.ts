import pc from "picocolors";

/**
 * Semantic color primitives for DXG terminal UX
 * These provide meaningful, intent-based styling rather than raw colors
 */

/**
 * Success indicator - green
 */
export const success = pc.green;

/**
 * Error indicator - red
 */
export const error = pc.red;

/**
 * Warning indicator - yellow
 */
export const warning = pc.yellow;

/**
 * Info indicator - blue/cyan
 */
export const info = pc.blue;

/**
 * Muted/dimmed text - gray
 */
export const muted = pc.gray;

/**
 * Accent/emphasis - magenta
 */
export const accent = pc.magenta;

/**
 * Picocolors primitives.
 */
export const {
  reset,
  bold,
  dim,
  italic,
  underline,
  inverse,
  hidden,
  strikethrough,

  black,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  gray,

  bgBlack,
  bgRed,
  bgGreen,
  bgYellow,
  bgBlue,
  bgMagenta,
  bgCyan,
  bgWhite,

  blackBright,
  redBright,
  greenBright,
  yellowBright,
  blueBright,
  magentaBright,
  cyanBright,
  whiteBright,

  bgBlackBright,
  bgRedBright,
  bgGreenBright,
  bgYellowBright,
  bgBlueBright,
  bgMagentaBright,
  bgCyanBright,
  bgWhiteBright,
} = pc;
