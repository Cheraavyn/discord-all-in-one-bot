import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { logger } from "./logger.js";
import { DEFAULT_MESSAGES } from "./memberMessages.js";
import { detectTimeZone } from "./timezones.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

let cache = null;
let saveTimer = null;
let saveQueue = Promise.resolve();

function defaultGuildSettings() {
  return {
    greeting: { ...DEFAULT_MESSAGES.greeting },
    goodbye: { ...DEFAULT_MESSAGES.goodbye },
    autoRole: { roleId: null },
    ticket: { categoryId: null, staffRoleId: null, counter: 0 },
    music: { volume: config.defaultVolume, shuffle: false, stayInVoice: false },
    moderation: {
      logChannelId: null,
      warnThreshold: 3,
      warnTimeoutMs: 10 * 60 * 1000,
      warnAutoTimeout: true,
    },
    tempVoice: { generatorChannelId: null, categoryId: null },
    leveling: {
      enabled: false,
      announce: true,
      announceChannelId: null,
      cooldownMs: 60 * 1000,
    },
    starboard: {
      channelId: null,
      emoji: "⭐",
      threshold: 3,
      selfStar: false,
    },
    serverStats: {
      enabled: false,
      categoryId: null,
      channels: { members: null, humans: null, bots: null, channels: null },
    },
    autopublish: { enabled: false },
    messageLog: { channelId: null, deleted: true, edited: true },
    birthday: {
      enabled: true,
      channelId: null,
      roleId: null,
      coins: 0,
      message: "🎉 Selamat ulang tahun, {user}! Semoga panjang umur, sehat, dan selalu bahagia. 🎂",
      timeZone: detectTimeZone(),
    },
  };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function merge(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === undefined) continue;
    result[key] = isPlainObject(value) && isPlainObject(result[key]) ? merge(result[key], value) : value;
  }
  return result;
}

/** Pindahkan pengaturan /welcome lama (teks biasa) ke greeting baru. */
function migrateLegacyWelcome(data) {
  for (const guild of Object.values(data)) {
    if (!isPlainObject(guild) || !isPlainObject(guild.welcome)) continue;

    const legacy = guild.welcome;
    guild.greeting = isPlainObject(guild.greeting) ? guild.greeting : {};

    if (legacy.channelId && !guild.greeting.channelId) {
      guild.greeting.channelId = legacy.channelId;
      guild.greeting.enabled = true;
    }
    if (legacy.message && !guild.greeting.description) {
      guild.greeting.description = legacy.message;
    }

    delete guild.welcome;
  }
}

export async function initSettings() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(SETTINGS_FILE, "utf8");
    cache = raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/settings.json, mulai dengan data kosong:", error.message);
    }
    cache = {};
  }

  migrateLegacyWelcome(cache);
}

export function getSettings(guildId) {
  if (!cache) throw new Error("Settings belum diinisialisasi. Panggil initSettings() dulu.");
  cache[guildId] = merge(defaultGuildSettings(), cache[guildId]);
  return cache[guildId];
}

export function updateSettings(guildId, patch) {
  const updated = merge(getSettings(guildId), patch);
  cache[guildId] = updated;
  scheduleSave();
  return updated;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flush().catch((error) => logger.error("Gagal menyimpan settings:", error.message));
  }, 500);
  saveTimer.unref?.();
}

async function doFlush() {
  await mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${SETTINGS_FILE}.tmp`;
  await writeFile(tmpFile, JSON.stringify(cache, null, 2), "utf8");
  await rename(tmpFile, SETTINGS_FILE);
}

function flush() {
  saveQueue = saveQueue.then(doFlush).catch((error) => {
    logger.error("Gagal menyimpan settings:", error.message);
  });
  return saveQueue;
}

/** Dipanggil saat bot shutdown agar perubahan terakhir tidak hilang. */
export async function closeSettings() {
  clearTimeout(saveTimer);
  if (!cache) return;
  await flush();
}
