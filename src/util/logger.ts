type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function log(level: LogLevel, msg: string): void {
  if (!shouldLog(level)) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] [${level.toUpperCase()}] ${msg}\n`);
}

export const logger = {
  debug: (msg: string) => log("debug", msg),
  info: (msg: string) => log("info", msg),
  warn: (msg: string) => log("warn", msg),
  error: (msg: string) => log("error", msg),
  setLevel: (level: LogLevel) => { currentLevel = level; },
  withAccount: (accountId: string) => ({
    debug: (msg: string) => log("debug", `[${accountId}] ${msg}`),
    info: (msg: string) => log("info", `[${accountId}] ${msg}`),
    warn: (msg: string) => log("warn", `[${accountId}] ${msg}`),
    error: (msg: string) => log("error", `[${accountId}] ${msg}`),
    getLogFilePath: () => "stderr",
  }),
};

export type Logger = ReturnType<typeof logger.withAccount>;
