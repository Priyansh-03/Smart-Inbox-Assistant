// Tiny console logger with a consistent prefix. Plain-english messages only.

const prefix = '[inbox]';

export const log = {
  info: (msg: string, ...rest: unknown[]) => console.info(`${prefix} ${msg}`, ...rest),
  warn: (msg: string, ...rest: unknown[]) => console.warn(`${prefix} ${msg}`, ...rest),
  error: (msg: string, ...rest: unknown[]) => console.error(`${prefix} ${msg}`, ...rest),
};
