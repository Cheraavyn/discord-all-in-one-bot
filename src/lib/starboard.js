import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEmbed, COLORS } from "./embeds.js";
import { logger } from "./logger.js";
import { getSettings } from "./settings.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const STARBOARD_FILE = path.join(DATA_DIR, "starboard.json");
const MAX_ENTRIES = 5000;

let entries = [];
let loaded = false;
let saveQueue = Promise.resolve();

export async function initStarboard() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(STARBOARD_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    entries = Array.isArray(data)
      ? data.filter((entry) => entry?.guildId && entry?.originalMessageId && entry?.starboardMessageId)
      : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/starboard.json, mulai dengan data kosong:", error.message);
    }
    entries = [];
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initStarboard();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);

      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${STARBOARD_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify(entries, null, 2), "utf8");
      await rename(tmpFile, STARBOARD_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/starboard.json:", error.message));

  return saveQueue;
}

function findEntry(guildId, originalMessageId) {
  return entries.find((entry) => entry.guildId === guildId && entry.originalMessageId === originalMessageId) ?? null;
}

async function removeEntry(entry) {
  const index = entries.indexOf(entry);
  if (index === -1) return;
  entries.splice(index, 1);
  await save();
}

function emojiMatches(emoji, configured) {
  const raw = String(configured ?? "").trim();
  if (!raw) return false;
  if (emoji.id && raw.includes(emoji.id)) return true;
  return emoji.name === raw || emoji.toString() === raw;
}

function buildStarboardEmbed(message, stars) {
  const name = message.member?.displayName ?? message.author.username;
  const attachment = message.attachments?.find(
    (item) => item.contentType?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(item.name ?? ""),
  );

  const body = message.content?.trim() || (attachment ? "*Pesan berisi gambar*" : "*Pesan tanpa teks*");
  const description = `${body}\n\n[Jump ke pesan](${message.url})`;

  return buildEmbed({
    description: description.slice(0, 4096),
    color: COLORS.warning,
    author: {
      name,
      iconURL: message.author.displayAvatarURL({ size: 128 }),
    },
    image: attachment?.url,
    footer: `⭐ ${stars} • #${message.channel?.name ?? "channel"}`,
  });
}

/** Cegah dua reaction bersamaan membuat dua postingan starboard. */
const pending = new Set();

/**
 * Dipanggil dari event messageReactionAdd/messageReactionRemove.
 * Hanya menangani reaction yang sesuai emoji starboard.
 */
export async function handleStarboardReaction(reaction, user, added) {
  try {
    if (reaction.partial) await reaction.fetch();
    if (user.partial) await user.fetch();
  } catch (error) {
    logger.debug("Gagal fetch reaction starboard:", error.message);
    return;
  }

  if (user.bot) return;

  const message = reaction.message;
  if (!message?.guildId) return;

  const guild =
    message.guild ??
    reaction.client.guilds.cache.get(message.guildId) ??
    (await reaction.client.guilds.fetch(message.guildId).catch(() => null));
  if (!guild) return;

  if (message.partial) {
    await message.fetch().catch((error) => {
      logger.debug("Gagal fetch pesan starboard:", error.message);
    });
    if (message.partial || !message.author) return;
  }

  const settings = getSettings(guild.id).starboard;
  if (!settings?.channelId) return;
  if (!message.author) return;
  if (message.channelId === settings.channelId) return;
  if (message.author.bot) return;
  if (!settings.selfStar && message.author.id === user.id) return;
  if (!emojiMatches(reaction.emoji, settings.emoji)) return;

  await ensureLoaded();

  const key = `${guild.id}:${message.id}`;
  if (pending.has(key)) return;

  pending.add(key);
  try {
    const stars = Math.max(0, reaction.count - (reaction.me ? 1 : 0));
    const existing = findEntry(guild.id, message.id);

    if (stars >= settings.threshold) {
      if (existing) {
        existing.stars = stars;
        await save();
        await updateStarboardMessage(guild, existing, message, stars);
        return;
      }

      await createStarboardMessage(guild, settings.channelId, message, stars);
      return;
    }

    if (existing && !added) {
      await removeStarboardPost(guild, existing);
    }
  } finally {
    pending.delete(key);
  }
}

/** Hapus postingan starboard saat pesan aslinya dihapus. */
export async function handleStarboardMessageDelete(message) {
  if (!message?.guildId) return;

  await ensureLoaded();

  const entry = findEntry(message.guildId, message.id);
  if (!entry) return;

  const guild =
    message.guild ??
    message.client?.guilds?.cache.get(message.guildId) ??
    null;

  if (guild) await removeStarboardPost(guild, entry);
  else await removeEntry(entry);
}

async function createStarboardMessage(guild, channelId, message, stars) {
  const channel =
    guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased()) return;

  try {
    if (message.partial) await message.fetch();

    const posted = await channel.send({ embeds: [buildStarboardEmbed(message, stars)] });

    entries.push({
      guildId: guild.id,
      originalMessageId: message.id,
      originalChannelId: message.channelId,
      starboardMessageId: posted.id,
      authorId: message.author.id,
      stars,
      createdAt: Date.now(),
    });
    await save();
  } catch (error) {
    logger.warn("Gagal membuat pesan starboard:", error.message);
  }
}

async function updateStarboardMessage(guild, entry, message, stars) {
  const channelId = getSettings(guild.id).starboard.channelId;
  if (!channelId) {
    await removeEntry(entry);
    return;
  }

  const channel =
    guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));

  const posted = channel?.isTextBased()
    ? await channel.messages.fetch(entry.starboardMessageId).catch(() => null)
    : null;

  if (!posted) {
    await removeEntry(entry);
    return;
  }

  await posted
    .edit({ embeds: [buildStarboardEmbed(message, stars)] })
    .catch((error) => logger.debug("Gagal memperbarui starboard:", error.message));
}

async function removeStarboardPost(guild, entry) {
  const channelId = getSettings(guild.id).starboard.channelId;

  if (channelId) {
    const channel =
      guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));

    if (channel?.isTextBased()) {
      const posted = await channel.messages.fetch(entry.starboardMessageId).catch(() => null);
      await posted?.delete().catch(() => {});
    }
  }

  await removeEntry(entry);
}
