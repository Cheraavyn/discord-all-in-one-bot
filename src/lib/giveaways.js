import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { buildEmbed, COLORS } from "./embeds.js";
import { BotError } from "./errors.js";
import { logger } from "./logger.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const GIVEAWAYS_FILE = path.join(DATA_DIR, "giveaways.json");
const MAX_TIMEOUT_MS = 2_147_000_000;
const KEEP_ENDED_MS = 30 * 24 * 60 * 60 * 1000;

const giveaways = new Map();
const timers = new Map();
let loaded = false;
let saveQueue = Promise.resolve();

export async function initGiveaways() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(GIVEAWAYS_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    const now = Date.now();

    for (const giveaway of Array.isArray(data) ? data : []) {
      if (!giveaway?.messageId || !giveaway?.guildId) continue;
      if (giveaway.ended && now - Number(giveaway.endedAt ?? 0) > KEEP_ENDED_MS) continue;
      giveaway.participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
      giveaway.winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
      giveaways.set(giveaway.messageId, giveaway);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/giveaways.json, mulai dengan data kosong:", error.message);
    }
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initGiveaways();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${GIVEAWAYS_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify([...giveaways.values()], null, 2), "utf8");
      await rename(tmpFile, GIVEAWAYS_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/giveaways.json:", error.message));

  return saveQueue;
}

export function getGiveaway(messageId) {
  return giveaways.get(messageId) ?? null;
}

export async function listGiveaways(guildId, { includeEnded = false } = {}) {
  await ensureLoaded();
  return [...giveaways.values()]
    .filter((giveaway) => giveaway.guildId === guildId && (includeEnded || !giveaway.ended))
    .sort((a, b) => a.endsAt - b.endsAt);
}

export function buildGiveawayEmbed(giveaway) {
  const requirement = giveaway.requirementRoleId ? `<@&${giveaway.requirementRoleId}>` : "Tidak ada";
  const winners = giveaway.ended
    ? giveaway.winnerIds.length
      ? giveaway.winnerIds.map((id) => `<@${id}>`).join(", ")
      : "Tidak ada peserta yang memenuhi syarat"
    : `${giveaway.winnerCount} pemenang`;

  return buildEmbed({
    title: `🎉 ${giveaway.prize}`,
    description: giveaway.ended
      ? "Giveaway ini sudah berakhir."
      : `Klik tombol di bawah untuk ikut!\nBerakhir <t:${Math.floor(giveaway.endsAt / 1000)}:R> (<t:${Math.floor(giveaway.endsAt / 1000)}:f>)`,
    color: giveaway.ended ? COLORS.neutral : COLORS.info,
    fields: [
      { name: "Pemenang", value: winners, inline: true },
      { name: "Peserta", value: `${giveaway.participants.length}`, inline: true },
      { name: "Syarat role", value: requirement, inline: true },
      { name: "Host", value: `<@${giveaway.hostId}>`, inline: true },
    ],
    footer: "Klik Ikut untuk berpartisipasi • Keluar untuk membatalkan",
  });
}

export function buildGiveawayComponents(giveaway) {
  if (giveaway.ended) return [];

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:join:${giveaway.messageId}`)
        .setLabel("Ikut")
        .setEmoji("🎉")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`giveaway:leave:${giveaway.messageId}`)
        .setLabel("Keluar")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export async function createGiveaway(client, data) {
  await ensureLoaded();

  const giveaway = {
    messageId: null,
    guildId: data.guildId,
    channelId: data.channelId,
    prize: String(data.prize).slice(0, 256),
    winnerCount: Math.max(1, Math.min(20, Number(data.winnerCount) || 1)),
    hostId: data.hostId,
    endsAt: data.endsAt,
    requirementRoleId: data.requirementRoleId ?? null,
    participants: [],
    winnerIds: [],
    ended: false,
    createdAt: Date.now(),
  };

  const channel =
    data.channel ??
    client.channels.cache.get(data.channelId) ??
    (await client.channels.fetch(data.channelId).catch(() => null));

  if (!channel?.isTextBased()) {
    throw new BotError("Channel giveaway tidak ditemukan atau bukan channel teks.");
  }

  const message = await channel.send({
    embeds: [buildEmbed({ title: "🎉 Giveaway", description: "Menyiapkan giveaway...", color: COLORS.info })],
  });

  giveaway.messageId = message.id;
  giveaways.set(message.id, giveaway);
  await save();

  await message.edit({
    embeds: [buildGiveawayEmbed(giveaway)],
    components: buildGiveawayComponents(giveaway),
  });

  schedule(client, giveaway);
  return giveaway;
}

function schedule(client, giveaway) {
  clearTimeout(timers.get(giveaway.messageId));

  const wait = Math.min(Math.max(0, giveaway.endsAt - Date.now()), MAX_TIMEOUT_MS);
  const timer = setTimeout(() => {
    if (Date.now() < giveaway.endsAt) {
      schedule(client, giveaway);
      return;
    }
    void endGiveaway(client, giveaway, { reroll: false }).catch((error) =>
      logger.error("Gagal mengakhiri giveaway:", error),
    );
  }, wait);

  timer.unref?.();
  timers.set(giveaway.messageId, timer);
}

/** Pulihkan timer giveaway setelah bot restart; giveaway yang sudah lewat langsung diakhiri. */
export async function restoreGiveaways(client) {
  await ensureLoaded();

  let restored = 0;
  for (const giveaway of giveaways.values()) {
    if (giveaway.ended) continue;
    schedule(client, giveaway);
    restored += 1;
  }

  if (restored) logger.info(`${restored} giveaway aktif dipulihkan.`);
}

export async function joinGiveaway(giveaway, userId) {
  if (giveaway.participants.includes(userId)) {
    throw new BotError("Kamu sudah ikut giveaway ini.");
  }

  giveaway.participants.push(userId);
  await save();
  return giveaway.participants.length;
}

export async function leaveGiveaway(giveaway, userId) {
  const index = giveaway.participants.indexOf(userId);
  if (index === -1) throw new BotError("Kamu belum ikut giveaway ini.");

  giveaway.participants.splice(index, 1);
  await save();
  return giveaway.participants.length;
}

function pickWinners(giveaway, excludeIds = []) {
  const all = [...new Set(giveaway.participants)];
  const excluded = new Set(excludeIds);
  const preferred = all.filter((id) => !excluded.has(id));

  // Reroll sebisa mungkin menghindari pemenang sebelumnya.
  const pool = preferred.length >= giveaway.winnerCount ? preferred : all;

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const random = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[random]] = [pool[random], pool[index]];
  }

  return pool.slice(0, giveaway.winnerCount);
}

export async function endGiveaway(client, giveaway, { reroll = false } = {}) {
  if (!reroll && giveaway.ended) throw new BotError("Giveaway ini sudah berakhir.");
  if (reroll && !giveaway.ended) throw new BotError("Giveaway ini belum berakhir.");
  if (reroll && giveaway.participants.length === 0) {
    throw new BotError("Tidak ada peserta untuk di-reroll.");
  }

  const winners = pickWinners(giveaway, reroll ? giveaway.winnerIds : []);

  giveaway.ended = true;
  giveaway.endedAt = Date.now();
  giveaway.winnerIds = winners;
  await save();

  clearTimeout(timers.get(giveaway.messageId));
  timers.delete(giveaway.messageId);

  const channel =
    client.channels.cache.get(giveaway.channelId) ??
    (await client.channels.fetch(giveaway.channelId).catch(() => null));

  const message = channel?.isTextBased()
    ? await channel.messages.fetch(giveaway.messageId).catch(() => null)
    : null;

  if (message) {
    await message
      .edit({ embeds: [buildGiveawayEmbed(giveaway)], components: buildGiveawayComponents(giveaway) })
      .catch(() => {});
  }

  if (channel?.isTextBased()) {
    const content = winners.length
      ? `🎉 Selamat ${winners.map((id) => `<@${id}>`).join(", ")}! Kamu memenangkan **${giveaway.prize}**.`
      : `😔 Giveaway **${giveaway.prize}** berakhir tanpa peserta.`;

    await channel
      .send({
        content: reroll ? `🔁 Reroll giveaway **${giveaway.prize}**\n${content}` : content,
        embeds: [buildGiveawayEmbed(giveaway)],
        allowedMentions: { users: winners },
      })
      .catch((error) => logger.warn("Gagal mengumumkan pemenang giveaway:", error.message));
  }

  return winners;
}

export async function handleGiveawayComponent(interaction) {
  const [, action, messageId] = interaction.customId.split(":");
  const giveaway = messageId ? getGiveaway(messageId) : null;

  if (!giveaway) {
    await interaction
      .reply({ content: "Giveaway ini sudah tidak aktif.", flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return;
  }

  try {
    if (action !== "join" && action !== "leave") {
      throw new BotError("Aksi giveaway tidak dikenal.");
    }
    if (giveaway.ended) throw new BotError("Giveaway ini sudah berakhir.");
    if (interaction.message.id !== giveaway.messageId) {
      throw new BotError("Giveaway ini tidak cocok dengan pesan.");
    }

    if (
      action !== "leave" &&
      giveaway.requirementRoleId &&
      !interaction.member?.roles?.cache?.has(giveaway.requirementRoleId)
    ) {
      throw new BotError(`Kamu butuh role <@&${giveaway.requirementRoleId}> untuk ikut giveaway ini.`);
    }

    const total =
      action === "leave"
        ? await leaveGiveaway(giveaway, interaction.user.id)
        : await joinGiveaway(giveaway, interaction.user.id);

    await interaction.reply({
      content:
        action === "leave"
          ? `➖ Kamu keluar dari giveaway **${giveaway.prize}**. Total peserta: ${total}.`
          : `✅ Kamu ikut giveaway **${giveaway.prize}**. Total peserta: ${total}.`,
      flags: MessageFlags.Ephemeral,
    });

    await interaction.message
      .edit({ embeds: [buildGiveawayEmbed(giveaway)], components: buildGiveawayComponents(giveaway) })
      .catch(() => {});
  } catch (error) {
    if (!(error instanceof BotError)) throw error;

    const payload = { content: error.message, flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
}
