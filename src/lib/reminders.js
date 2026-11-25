import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEmbed, COLORS } from "./embeds.js";
import { BotError } from "./errors.js";
import { logger } from "./logger.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const REMINDERS_FILE = path.join(DATA_DIR, "reminders.json");
const MAX_REMINDERS_PER_USER = 10;
const MAX_TIMEOUT_MS = 2_147_000_000;

export const MAX_REMINDER_MS = 30 * 24 * 60 * 60 * 1000;

let reminders = [];
let loaded = false;
const timers = new Map();
let saveQueue = Promise.resolve();

export async function initReminders() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(REMINDERS_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    reminders = Array.isArray(data) ? data.filter((reminder) => reminder?.id && reminder?.dueAt) : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/reminders.json, mulai dengan data kosong:", error.message);
    }
    reminders = [];
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initReminders();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${REMINDERS_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify(reminders, null, 2), "utf8");
      await rename(tmpFile, REMINDERS_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/reminders.json:", error.message));

  return saveQueue;
}

/** Jadwalkan ulang semua pengingat yang tersimpan. Dipanggil saat bot siap. */
export async function restoreReminders(client) {
  await ensureLoaded();
  for (const reminder of reminders) schedule(client, reminder);

  if (reminders.length) logger.info(`${reminders.length} pengingat aktif dipulihkan.`);
}

export async function createReminder({ client, guildId, channelId, userId, message, dueAt }) {
  await ensureLoaded();

  const active = reminders.filter(
    (reminder) => reminder.guildId === guildId && reminder.userId === userId,
  ).length;
  if (active >= MAX_REMINDERS_PER_USER) {
    throw new BotError(`Maksimal ${MAX_REMINDERS_PER_USER} pengingat aktif per user.`);
  }

  const reminder = {
    id: randomBytes(4).toString("hex"),
    guildId,
    channelId,
    userId,
    message: String(message).slice(0, 1000),
    dueAt,
  };

  reminders.push(reminder);
  await save();
  schedule(client, reminder);
  return reminder;
}

export async function listReminders(guildId, userId) {
  await ensureLoaded();
  return reminders
    .filter((reminder) => reminder.guildId === guildId && reminder.userId === userId)
    .sort((a, b) => a.dueAt - b.dueAt);
}

export async function cancelReminder(guildId, userId, id) {
  await ensureLoaded();

  const index = reminders.findIndex(
    (reminder) => reminder.id === id && reminder.guildId === guildId && reminder.userId === userId,
  );
  if (index === -1) throw new BotError(`Pengingat dengan ID \`${id}\` tidak ditemukan.`);

  const [removed] = reminders.splice(index, 1);
  clearTimeout(timers.get(id));
  timers.delete(id);
  await save();
  return removed;
}

function schedule(client, reminder) {
  clearTimeout(timers.get(reminder.id));

  const delay = Math.max(0, reminder.dueAt - Date.now());
  const wait = Math.min(delay, MAX_TIMEOUT_MS);

  const timer = setTimeout(() => {
    if (Date.now() < reminder.dueAt) {
      schedule(client, reminder);
      return;
    }
    void deliver(client, reminder);
  }, wait);

  timer.unref?.();
  timers.set(reminder.id, timer);
}

async function deliver(client, reminder) {
  const index = reminders.findIndex((item) => item.id === reminder.id);
  if (index === -1) return;

  reminders.splice(index, 1);
  clearTimeout(timers.get(reminder.id));
  timers.delete(reminder.id);
  await save();

  const embed = buildEmbed({
    title: "⏰ Pengingat",
    description: reminder.message,
    color: COLORS.info,
    footer: `ID: ${reminder.id}`,
  });

  try {
    const channel =
      client.channels.cache.get(reminder.channelId) ??
      (await client.channels.fetch(reminder.channelId).catch(() => null));

    if (channel?.isTextBased()) {
      await channel.send({ content: `<@${reminder.userId}>`, embeds: [embed] });
      return;
    }
  } catch (error) {
    logger.debug("Gagal mengirim pengingat ke channel:", error.message);
  }

  try {
    const user = await client.users.fetch(reminder.userId);
    await user.send({ embeds: [embed] });
  } catch (error) {
    logger.warn(`Gagal mengirim pengingat ${reminder.id} ke user ${reminder.userId}:`, error.message);
  }
}
