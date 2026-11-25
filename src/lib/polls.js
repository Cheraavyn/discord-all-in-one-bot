import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { buildEmbed, COLORS } from "./embeds.js";
import { BotError } from "./errors.js";
import { logger } from "./logger.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const POLLS_FILE = path.join(DATA_DIR, "polls.json");
const POLL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const MAX_POLL_OPTIONS = 10;

const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

const polls = new Map();
let loaded = false;
let saveQueue = Promise.resolve();

/** Muat polling yang belum ditutup dari disk agar tombol tetap bekerja setelah restart. */
export async function initPolls() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(POLLS_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];

    if (!Array.isArray(data)) throw new Error("format file tidak valid");

    const now = Date.now();
    for (const poll of data) {
      if (!poll?.messageId || poll.closed) continue;
      if (now - Number(poll.createdAt ?? 0) > POLL_TTL_MS) continue;
      poll.votes = poll.votes ?? {};
      polls.set(poll.messageId, poll);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/polls.json, mulai dengan data kosong:", error.message);
    }
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initPolls();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${POLLS_FILE}.tmp`;
      const activePolls = [...polls.values()].filter((poll) => !poll.closed);
      await writeFile(tmpFile, JSON.stringify(activePolls, null, 2), "utf8");
      await rename(tmpFile, POLLS_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/polls.json:", error.message));

  return saveQueue;
}

export async function createPoll(data) {
  await ensureLoaded();

  const poll = {
    ...data,
    question: String(data.question).slice(0, 256),
    options: data.options.map((option) => String(option).slice(0, 100)),
    multiple: Boolean(data.multiple),
    votes: {},
    closed: false,
    createdAt: Date.now(),
  };

  polls.set(poll.messageId, poll);
  await save();
  return poll;
}

export function getPoll(messageId) {
  return polls.get(messageId) ?? null;
}

export async function closePoll(poll) {
  poll.closed = true;
  await save();
}

export function toggleVote(poll, userId, index) {
  if (poll.closed) throw new BotError("Polling ini sudah ditutup.");
  if (!Number.isInteger(index) || index < 0 || index >= poll.options.length) {
    throw new BotError("Pilihan polling tidak valid.");
  }

  const current = new Set(poll.votes[userId] ?? []);

  if (poll.multiple) {
    if (current.has(index)) current.delete(index);
    else current.add(index);
  } else if (current.has(index)) {
    current.clear();
  } else {
    current.clear();
    current.add(index);
  }

  if (current.size) poll.votes[userId] = [...current].sort((a, b) => a - b);
  else delete poll.votes[userId];

  return [...current];
}

export function buildPollEmbed(poll) {
  const counts = poll.options.map(
    (_, index) => Object.values(poll.votes).filter((choices) => choices.includes(index)).length,
  );
  const totalVotes = counts.reduce((total, count) => total + count, 0);
  const voters = Object.keys(poll.votes).length;

  const description = poll.options
    .map((option, index) => {
      const percent = totalVotes ? Math.round((counts[index] / totalVotes) * 100) : 0;
      return `${NUMBER_EMOJIS[index]} **${option}** — ${counts[index]} suara (${percent}%)`;
    })
    .join("\n");

  const fields = [{ name: "Total suara", value: `${totalVotes} suara • ${voters} pemilih`, inline: true }];
  if (poll.multiple) fields.push({ name: "Tipe", value: "Bisa pilih lebih dari satu", inline: true });

  return buildEmbed({
    title: poll.question,
    description,
    color: poll.closed ? COLORS.neutral : COLORS.info,
    fields,
    footer: poll.closed ? "Polling ditutup" : `Dibuat oleh <@${poll.creatorId}> • Klik tombol untuk memilih`,
  });
}

export function buildPollComponents(poll) {
  const rows = [];

  for (let start = 0; start < poll.options.length; start += 5) {
    const row = new ActionRowBuilder();
    poll.options.slice(start, start + 5).forEach((option, offset) => {
      const index = start + offset;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`poll:vote:${index}`)
          .setEmoji(NUMBER_EMOJIS[index])
          .setLabel(option.slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(poll.closed),
      );
    });
    rows.push(row);
  }

  if (!poll.closed) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("poll:close")
          .setEmoji("🔒")
          .setLabel("Tutup Poll")
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }

  return rows;
}

export async function handlePollComponent(interaction) {
  const [, action, rawIndex] = interaction.customId.split(":");
  const poll = getPoll(interaction.message.id);

  if (!poll) {
    await interaction
      .reply({ content: "Polling ini sudah tidak aktif.", flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return;
  }

  try {
    if (action === "close") {
      const canClose =
        interaction.user.id === poll.creatorId ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);

      if (!canClose) throw new BotError("Hanya pembuat polling atau moderator yang bisa menutup polling ini.");
      if (poll.closed) throw new BotError("Polling ini sudah ditutup.");

      await closePoll(poll);
      await interaction.update({
        embeds: [buildPollEmbed(poll)],
        components: buildPollComponents(poll),
      });
      return;
    }

    if (action === "vote") {
      toggleVote(poll, interaction.user.id, Number(rawIndex));
      await save();
      await interaction.update({
        embeds: [buildPollEmbed(poll)],
        components: buildPollComponents(poll),
      });
      return;
    }

    await interaction
      .reply({ content: "Aksi polling tidak dikenal.", flags: MessageFlags.Ephemeral })
      .catch(() => {});
  } catch (error) {
    if (!(error instanceof BotError)) throw error;

    const payload = { content: error.message, flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
}
