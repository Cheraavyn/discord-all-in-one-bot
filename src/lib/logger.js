const COLORS = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const LEVEL_STYLE = {
  info: { label: "INFO", color: COLORS.cyan },
  ready: { label: "READY", color: COLORS.green },
  warn: { label: "WARN", color: COLORS.yellow },
  error: { label: "ERROR", color: COLORS.red },
  music: { label: "MUSIC", color: COLORS.magenta },
  debug: { label: "DEBUG", color: COLORS.gray },
};

function timestamp() {
  return new Date().toLocaleTimeString("id-ID", { hour12: false });
}

function write(level, args) {
  const style = LEVEL_STYLE[level] ?? LEVEL_STYLE.info;
  const prefix = `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${style.color}${style.label.padEnd(5)}${COLORS.reset}`;
  console.log(prefix, ...args);
}

export const logger = {
  info: (...args) => write("info", args),
  ready: (...args) => write("ready", args),
  warn: (...args) => write("warn", args),
  error: (...args) => write("error", args),
  music: (...args) => write("music", args),
  debug: (...args) => {
    if (process.env.DEBUG) write("debug", args);
  },
};
