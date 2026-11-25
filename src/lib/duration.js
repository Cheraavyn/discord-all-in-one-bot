const UNIT_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Mengubah "10m", "2h", "1d", atau "30" (detik) menjadi milidetik.
 * @returns {number|null} null jika format tidak dikenali.
 */
export function parseDuration(input) {
  if (typeof input !== "string") return null;
  const match = /^(\d{1,6})\s*(s|m|h|d|w)?$/i.exec(input.trim());
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();
  return amount * UNIT_MS[unit];
}

/** Format milidetik menjadi teks singkat, mis. "1j 5m 20d". */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0d";

  let remaining = Math.floor(ms / 1000);
  const days = Math.floor(remaining / 86400);
  remaining %= 86400;
  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const parts = [];
  if (days) parts.push(`${days}h`);
  if (hours) parts.push(`${hours}j`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && !days) parts.push(`${seconds}d`);

  return parts.join(" ") || "0d";
}

/** Format detik menjadi mm:ss atau hh:mm:ss (untuk durasi lagu). */
export function formatTimestamp(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "LIVE";

  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);

  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Timestamp Discord, mis. <t:1700000000:R>. */
export function discordTimestamp(date) {
  const ms = date instanceof Date ? date.getTime() : Number(date);
  return `<t:${Math.floor(ms / 1000)}:R>`;
}
