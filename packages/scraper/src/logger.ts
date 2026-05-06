export type Logger = {
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export const noopLogger: Logger = {
  debug: () => {},
  warn: () => {},
  error: () => {},
};

export function createLogger(debug: boolean): Logger {
  return {
    debug: debug ? console.log.bind(console) : () => {},
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
}
