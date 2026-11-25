import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEmbed, COLORS } from "./embeds.js";
import { logger } from "./logger.js";
import { getSettings } from "./settings.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const ACTIONS_FILE = path.join(DATA_DIR, "modactions.json");
const MAX_ACTIONS = 3000;

const ACTION_LABELS = {
  ban: "Ban",
  unban: "Unban",
  kick: "Kick",
  timeout: "Timeout",
  purge: "Purge Pesan",
  slowmode: "Slowmode",
  warn: "Peringatan",
  warn_clear: "Hapus Peringatan",
  warn_clear_all: "Hapus Semua Peringatan",
  lockdown: "Lockdown",
  unlockdown: "Buka Lockdown",
};

let actions = [];
let loaded = false;
let saveQueue = Promise.resolve();

export function actionLabel(action) {
  return ACTION_LABELS[action] ?? action;
}

export async function initModActions() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(ACTIONS_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    actions = Array.isArray(data) ? data.filter((record) => record?.id && record?.guildId) : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/modactions.json, mulai dengan data kosong:", error.message);
    }
    actions = [];
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initModActions();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      if (actions.length > MAX_ACTIONS) actions = actions.slice(-MAX_ACTIONS);

      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${ACTIONS_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify(actions, null, 2), "utf8");
      await rename(tmpFile, ACTIONS_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/modactions.json:", error.message));

  return saveQueue;
}

/**
 * Simpan aksi moderasi ke riwayat dan kirim ke channel mod log (kalau diatur).
 * Tidak pernah melempar error agar aksi moderasi yang sudah berhasil tidak dianggap gagal.
 */
export async function logModeration(
  guild,
  {
    action,
    reason = "Tidak ada alasan",
    targetId = null,
    targetTag = null,
    targetLabel = null,
    moderator = null,
    fields = [],
    color = COLORS.info,
  },
) {
  try {
    await ensureLoaded();
  } catch (error) {
    logger.warn("Gagal memuat riwayat moderasi:", error.message);
  }

  const record = {
    id: randomBytes(4).toString("hex"),
    guildId: guild.id,
    action,
    targetId,
    targetTag,
    targetLabel,
    moderatorId: moderator?.id ?? null,
    moderatorTag: moderator?.tag ?? "Sistem",
    reason: String(reason || "Tidak ada alasan").slice(0, 512),
    details: fields,
    createdAt: Date.now(),
  };

  actions.push(record);
  await save();

  try {
    const settings = getSettings(guild.id);
    const channelId = settings.moderation?.logChannelId;
    if (!channelId) return record;

    const channel =
      guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel?.isTextBased()) return record;

    const embedFields = [
      { name: "Target", value: targetLabel ?? targetTag ?? targetId ?? "—", inline: true },
      { name: "Moderator", value: moderator ? `${moderator}` : "Sistem", inline: true },
      { name: "Alasan", value: record.reason },
      ...fields,
    ].filter((field) => field?.value);

    const embed = buildEmbed({
      title: `🛡️ Aksi Moderasi • ${actionLabel(action)}`,
      color,
      fields: embedFields,
      footer: `ID: ${record.id}`,
    });

    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.debug("Gagal mengirim mod log:", error.message);
  }

  return record;
}

export async function listModActions(guildId, targetId, limit = 10) {
  await ensureLoaded();

  return actions
    .filter((record) => record.guildId === guildId && (!targetId || record.targetId === targetId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function countModActions(guildId, targetId) {
  await ensureLoaded();
  return actions.filter((record) => record.guildId === guildId && (!targetId || record.targetId === targetId)).length;
}
