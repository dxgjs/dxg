export const reset = '\x1b[0m';

export const fgColors: Record<string, string> = {
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
};

export const bgColors: Record<string, string> = {
  black: '\x1b[40m',
  red: '\x1b[41m',
  green: '\x1b[42m',
  yellow: '\x1b[43m',
  blue: '\x1b[44m',
  magenta: '\x1b[45m',
  cyan: '\x1b[46m',
  white: '\x1b[47m',
  brightBlack: '\x1b[100m',
  brightRed: '\x1b[101m',
  brightGreen: '\x1b[102m',
  brightYellow: '\x1b[103m',
  brightBlue: '\x1b[104m',
  brightMagenta: '\x1b[105m',
  brightCyan: '\x1b[106m',
  brightWhite: '\x1b[107m',
};

export const styles: Record<string, string> = {
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',
  strikethrough: '\x1b[9m',
};

// Foreground color functions
export const black = (text: string) => fgColors.black + text + reset;
export const red = (text: string) => fgColors.red + text + reset;
export const green = (text: string) => fgColors.green + text + reset;
export const yellow = (text: string) => fgColors.yellow + text + reset;
export const blue = (text: string) => fgColors.blue + text + reset;
export const magenta = (text: string) => fgColors.magenta + text + reset;
export const cyan = (text: string) => fgColors.cyan + text + reset;
export const white = (text: string) => fgColors.white + text + reset;
export const brightBlack = (text: string) => fgColors.brightBlack + text + reset;
export const brightRed = (text: string) => fgColors.brightRed + text + reset;
export const brightGreen = (text: string) => fgColors.brightGreen + text + reset;
export const brightYellow = (text: string) => fgColors.brightYellow + text + reset;
export const brightBlue = (text: string) => fgColors.brightBlue + text + reset;
export const brightMagenta = (text: string) => fgColors.brightMagenta + text + reset;
export const brightCyan = (text: string) => fgColors.brightCyan + text + reset;
export const brightWhite = (text: string) => fgColors.brightWhite + text + reset;

// Background color functions
export const bgBlack = (text: string) => bgColors.black + text + reset;
export const bgRed = (text: string) => bgColors.red + text + reset;
export const bgGreen = (text: string) => bgColors.green + text + reset;
export const bgYellow = (text: string) => bgColors.yellow + text + reset;
export const bgBlue = (text: string) => bgColors.blue + text + reset;
export const bgMagenta = (text: string) => bgColors.magenta + text + reset;
export const bgCyan = (text: string) => bgColors.cyan + text + reset;
export const bgWhite = (text: string) => bgColors.white + text + reset;
export const bgBrightBlack = (text: string) => bgColors.brightBlack + text + reset;
export const bgBrightRed = (text: string) => bgColors.brightRed + text + reset;
export const bgBrightGreen = (text: string) => bgColors.brightGreen + text + reset;
export const bgBrightYellow = (text: string) => bgColors.brightYellow + text + reset;
export const bgBrightBlue = (text: string) => bgColors.brightBlue + text + reset;
export const bgBrightMagenta = (text: string) => bgColors.brightMagenta + text + reset;
export const bgBrightCyan = (text: string) => bgColors.brightCyan + text + reset;
export const bgBrightWhite = (text: string) => bgColors.brightWhite + text + reset;

// Style functions
export const bold = (text: string) => styles.bold + text + reset;
export const dim = (text: string) => styles.dim + text + reset;
export const italic = (text: string) => styles.italic + text + reset;
export const underline = (text: string) => styles.underline + text + reset;
export const inverse = (text: string) => styles.inverse + text + reset;
export const strikethrough = (text: string) => styles.strikethrough + text + reset;

// Strip ANSI codes
export function strip(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

export function colorize(text: string, color: keyof typeof fgColors | keyof typeof bgColors, isBg: boolean = false): string {
  const map = isBg ? bgColors : fgColors;
  return (map[color] ?? '') + text + reset;
}

export function style(text: string, style: keyof typeof styles): string {
  return (styles[style] ?? '') + text + reset;
}


// ANSI object for convenient access
export const ansi = {
  // Foreground colors
  black,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  brightBlack,
  brightRed,
  brightGreen,
  brightYellow,
  brightBlue,
  brightMagenta,
  brightCyan,
  brightWhite,
  // Background colors
  bgBlack,
  bgRed,
  bgGreen,
  bgYellow,
  bgBlue,
  bgMagenta,
  bgCyan,
  bgWhite,
  bgBrightBlack,
  bgBrightRed,
  bgBrightGreen,
  bgBrightYellow,
  bgBrightBlue,
  bgBrightMagenta,
  bgBrightCyan,
  bgBrightWhite,
  // Styles
  bold,
  dim,
  italic,
  underline,
  inverse,
  strikethrough,
  // Strip function
  strip,
  // Reset
  reset,
  // The colorize and style functions are also useful
  colorize,
  style
};