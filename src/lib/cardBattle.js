import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
} from "discord.js";
import {
  ELEMENTS,
  ELEMENT_SKILLS,
  RARITIES,
  cardPower,
  effectiveStats,
  formatCardHeader,
  getCard,
  withCardLevel,
} from "./cardCatalog.js";
import {
  battlePayout,
  getCardCount,
  getCardLevel,
  getOwnedCards,
  recordBattleResult,
  simulateBattle,
} from "./cards.js";
import { addBalance, getBalance, spendBalance } from "./economy.js";
import { buildEmbed, COLORS, info } from "./embeds.js";
import { BotError } from "./errors.js";
import { logger } from "./logger.js";
import { recordQuestProgress } from "./quests.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const challenges = new Map();

export function hasActiveChallenge(guildId, userId) {
  return [...challenges.values()].some(
    (challenge) =>
      challenge.guildId === guildId &&
      challenge.status === "pending" &&
      (challenge.challengerId === userId || challenge.defenderId === userId),
  );
}

export function createChallenge({ client, guildId, challengerId, defenderId, cardId, bet }) {
  const id = randomBytes(4).toString("hex");
  const challenge = {
    id,
    guildId,
    channelId: null,
    messageId: null,
    challengerId,
    defenderId,
    cardId,
    bet,
    status: "pending",
    createdAt: Date.now(),
    client,
    timer: null,
  };

  challenge.timer = setTimeout(() => void expireChallenge(challenge), CHALLENGE_TTL_MS);
  challenge.timer.unref?.();
  challenges.set(id, challenge);
  return challenge;
}

export function attachChallengeMessage(challenge, message) {
  challenge.channelId = message.channelId;
  challenge.messageId = message.id;
}

function cardBlock(card) {
  const rarity = RARITIES[card.rarity];
  const element = ELEMENTS[card.element];
  const beats = ELEMENTS[element.beats];
  const skill = ELEMENT_SKILLS[card.element];
  const stats = effectiveStats(card);

  return [
    formatCardHeader(card),
    `${element.emoji} ${element.label} · unggul vs ${beats.emoji} ${beats.label}`,
    `ATK **${stats.atk}** · DEF **${stats.def}** · SPD **${stats.spd}** · HP **${stats.hp}**`,
    `${skill.emoji} Skill: **${skill.name}**`,
    `${cardPower(card)} power · jual 🪙 ${rarity.sell.toLocaleString("id-ID")}`,
  ].join("\n");
}

export function buildChallengeEmbed(challenge) {
  const base = getCard(challenge.cardId);
  const card = base
    ? withCardLevel(base, getCardLevel(challenge.guildId, challenge.challengerId, base.id))
    : null;
  const { tax, payout } = battlePayout(challenge.bet);

  return buildEmbed({
    title: "⚔️ Tantangan Duel Kartu",
    description: [
      `<@${challenge.challengerId}> menantang <@${challenge.defenderId}>!`,
      "",
      `**Taruhan:** 🪙 ${challenge.bet.toLocaleString("id-ID")} dari masing-masing pemain`,
      `**Hadiah:** 🪙 ${payout.toLocaleString("id-ID")} untuk pemenang`,
      `**Pajak arena:** 🪙 ${tax.toLocaleString("id-ID")} (5%)`,
      "",
      "Klik **Terima & Pilih Kartu** untuk menerima tantangan.",
    ].join("\n"),
    color: card ? RARITIES[card.rarity].color : COLORS.info,
    fields: [
      { name: "Kartu Penantang", value: card ? cardBlock(card) : "*Kartu tidak ditemukan*", inline: true },
      { name: "Kartu Lawan", value: "*Belum dipilih*", inline: true },
    ],
    footer: "Tantangan berlaku 5 menit • Hanya lawan yang bisa merespons",
  });
}

export function buildChallengeComponents(challenge) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cardbattle:accept:${challenge.id}`)
        .setLabel("Terima & Pilih Kartu")
        .setEmoji("⚔️")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`cardbattle:decline:${challenge.id}`)
        .setLabel("Tolak")
        .setEmoji("✖️")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function buildDefenderSelect(challenge) {
  const allOwned = getOwnedCards(challenge.guildId, challenge.defenderId);
  const owned = allOwned.slice(0, 25);

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`cardbattle:pick:${challenge.id}`)
      .setPlaceholder(
        allOwned.length > 25 ? "Pilih kartu (25 kartu terkuat)" : "Pilih kartu untuk duel",
      )
      .addOptions(
        owned.map(({ card, count, level, stats }) => ({
          label: `${card.name} (${RARITIES[card.rarity].label}) Lv.${level}`.slice(0, 100),
          description: `ATK ${stats.atk} · DEF ${stats.def} · SPD ${stats.spd} · dimiliki x${count}`.slice(0, 100),
          value: card.id,
          emoji: card.emoji,
        })),
      ),
  );
}

function resultCardBlock(card, hp, maxHp) {
  const stats = effectiveStats(card);
  const skill = ELEMENT_SKILLS[card.element];

  return [
    formatCardHeader(card),
    `HP **${hp}/${maxHp}**`,
    `ATK ${stats.atk} · DEF ${stats.def} · SPD ${stats.spd}`,
    `${skill.emoji} ${skill.name}`,
  ].join("\n");
}

export function buildBattleResultEmbed({ challenge, challengerCard, defenderCard, simulation, winnerId, payout, tax }) {
  const winnerCard = simulation.winner === "a" ? challengerCard : defenderCard;
  const lines = [];
  let currentRound = 0;

  for (const event of simulation.events) {
    if (event.round !== currentRound) {
      currentRound = event.round;
      lines.push(`${lines.length ? "\n" : ""}**Ronde ${event.round}**`);
    }

    const actor = event.attacker === "a" ? challengerCard : defenderCard;
    const defender = event.attacker === "a" ? defenderCard : challengerCard;
    const actorHp = event.attacker === "a" ? event.hpA : event.hpB;
    const actorMax = event.attacker === "a" ? simulation.maxHpA : simulation.maxHpB;

    if (event.kind === "heal") {
      lines.push(
        `${actor.emoji} **${actor.name}** memulihkan **${event.heal}** HP · HP ${actorHp}/${actorMax}`,
      );
      continue;
    }

    const defenderHp = event.attacker === "a" ? event.hpB : event.hpA;
    const defenderMax = event.attacker === "a" ? simulation.maxHpB : simulation.maxHpA;
    const tags = [
      event.advantage ? "advantage elemen" : null,
      event.crit ? "CRIT" : null,
      event.hits > 1 ? "serangan ganda" : null,
      event.shielded ? "perisai bumi" : null,
    ]
      .filter(Boolean)
      .join(" · ");

    lines.push(
      `${actor.emoji} **${actor.name}** → ${defender.emoji} ${defender.name}: **${event.damage}** dmg${tags ? ` *(${tags})*` : ""} · HP ${defenderHp}/${defenderMax}`,
    );
  }

  return buildEmbed({
    title: `🏆 ${winnerCard.emoji} ${winnerCard.name} Menang!`,
    description: lines.join("\n"),
    color: RARITIES[winnerCard.rarity].color,
    fields: [
      {
        name: `Penantang · <@${challenge.challengerId}>`,
        value: resultCardBlock(challengerCard, simulation.hpA, simulation.maxHpA),
        inline: true,
      },
      {
        name: `Lawan · <@${challenge.defenderId}>`,
        value: resultCardBlock(defenderCard, simulation.hpB, simulation.maxHpB),
        inline: true,
      },
      {
        name: "Hasil Duel",
        value: [
          `Pemenang: <@${winnerId}>`,
          `Hadiah: 🪙 **${payout.toLocaleString("id-ID")}**`,
          `Pajak arena: 🪙 ${tax.toLocaleString("id-ID")}`,
        ].join("\n"),
      },
    ],
    footer: "5% pot dibakar untuk menjaga ekonomi server",
  });
}

async function fetchChallengeMessage(challenge) {
  if (!challenge.channelId || !challenge.messageId) return null;

  const channel = await challenge.client.channels.fetch(challenge.channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;

  return channel.messages.fetch(challenge.messageId).catch(() => null);
}

async function expireChallenge(challenge) {
  if (challenge.status !== "pending") return;
  challenge.status = "expired";
  challenges.delete(challenge.id);

  const message = await fetchChallengeMessage(challenge);
  if (!message) return;

  await message
    .edit({
      embeds: [
        buildEmbed({
          title: "⌛ Tantangan Kedaluwarsa",
          description: `<@${challenge.challengerId}> menantang <@${challenge.defenderId}>, tapi tidak direspons dalam 5 menit.`,
          color: COLORS.neutral,
        }),
      ],
      components: [],
    })
    .catch((error) => logger.debug("Gagal menandai tantangan kedaluwarsa:", error.message));
}

/**
 * Menyelesaikan duel: potong taruhan kedua pemain, simulasikan, lalu bayar pemenang.
 * Dipisah dari handler Discord supaya bisa diuji tanpa interaksi asli.
 */
export async function finalizeBattle(challenge, defenderCardId) {
  if (challenge.status !== "pending") {
    throw new BotError("Tantangan ini sudah selesai atau kedaluwarsa.");
  }

  const challengerBase = getCard(challenge.cardId);
  const defenderBase = getCard(defenderCardId);
  if (!challengerBase) throw new BotError("Kartu penantang tidak ditemukan.");
  if (!defenderBase) throw new BotError("Kartu yang kamu pilih tidak ditemukan.");

  if (!getCardCount(challenge.guildId, challenge.challengerId, challengerBase.id)) {
    throw new BotError("Penantang sudah tidak memiliki kartu yang dipakai.");
  }
  if (!getCardCount(challenge.guildId, challenge.defenderId, defenderBase.id)) {
    throw new BotError("Kamu tidak memiliki kartu itu.");
  }

  const challengerCard = withCardLevel(
    challengerBase,
    getCardLevel(challenge.guildId, challenge.challengerId, challengerBase.id),
  );
  const defenderCard = withCardLevel(
    defenderBase,
    getCardLevel(challenge.guildId, challenge.defenderId, defenderBase.id),
  );

  challenge.status = "processing";

  try {
    const { guildId, challengerId, defenderId, bet } = challenge;

    if (getBalance(guildId, challengerId) < bet) {
      throw new BotError("Saldo penantang tidak lagi cukup untuk taruhan ini.");
    }
    if (getBalance(guildId, defenderId) < bet) {
      throw new BotError(
        `Saldo kamu tidak cukup. Butuh **${bet.toLocaleString("id-ID")}** koin untuk menerima tantangan ini.`,
      );
    }

    await spendBalance(guildId, challengerId, bet);
    try {
      await spendBalance(guildId, defenderId, bet);
    } catch (error) {
      await addBalance(guildId, challengerId, bet);
      throw error;
    }

    const simulation = simulateBattle(challengerCard, defenderCard);
    const winnerId = simulation.winner === "a" ? challengerId : defenderId;
    const loserId = simulation.winner === "a" ? defenderId : challengerId;
    const { payout, tax } = battlePayout(bet);

    await addBalance(guildId, winnerId, payout);
    await recordQuestProgress(guildId, winnerId, "battle_win");
    await recordBattleResult(guildId, winnerId, loserId, { bet, payout });

    challenge.status = "done";
    if (challenge.timer) clearTimeout(challenge.timer);
    challenges.delete(challenge.id);

    return { challengerCard, defenderCard, simulation, winnerId, loserId, payout, tax };
  } catch (error) {
    challenge.status = "pending";
    throw error;
  }
}

async function replyEphemeral(interaction, payload) {
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
}

export async function handleCardBattleComponent(interaction) {
  const [, action, id] = interaction.customId.split(":");
  const challenge = challenges.get(id);

  if (!challenge) {
    await replyEphemeral(interaction, {
      embeds: [info("Tantangan ini sudah selesai atau kedaluwarsa.", "Tantangan Tidak Aktif")],
    });
    return;
  }

  if (interaction.user.id !== challenge.defenderId) {
    await replyEphemeral(interaction, {
      embeds: [info("Hanya lawan yang ditantang yang bisa merespons tantangan ini.", "Bukan Tantanganmu")],
    });
    return;
  }

  if (action === "decline") {
    if (challenge.status !== "pending") {
      await replyEphemeral(interaction, { embeds: [info("Tantangan ini sudah selesai.")] });
      return;
    }

    challenge.status = "declined";
    if (challenge.timer) clearTimeout(challenge.timer);
    challenges.delete(challenge.id);

    const message = await fetchChallengeMessage(challenge);
    await message
      ?.edit({
        embeds: [
          buildEmbed({
            title: "🛡️ Tantangan Ditolak",
            description: `<@${challenge.defenderId}> menolak tantangan dari <@${challenge.challengerId}>.`,
            color: COLORS.neutral,
          }),
        ],
        components: [],
      })
      .catch(() => {});

    await replyEphemeral(interaction, { embeds: [info("Tantangan ditolak.", "Ditolak")] });
    return;
  }

  if (action === "accept") {
    if (challenge.status !== "pending") {
      await replyEphemeral(interaction, { embeds: [info("Tantangan ini sudah selesai atau kedaluwarsa.")] });
      return;
    }

    const owned = getOwnedCards(challenge.guildId, challenge.defenderId);
    if (!owned.length) {
      await replyEphemeral(interaction, {
        embeds: [info("Kamu belum punya kartu. Buka kartu dulu dengan `/gacha`.", "Belum Punya Kartu")],
      });
      return;
    }

    await interaction.reply({
      embeds: [
        buildEmbed({
          title: "🃏 Pilih Kartumu",
          description: `Taruhan: 🪙 **${challenge.bet.toLocaleString("id-ID")}**\nPilih satu kartu untuk melawan **${getCard(challenge.cardId).name}**.`,
          color: COLORS.info,
        }),
      ],
      components: [buildDefenderSelect(challenge)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "pick") {
    const cardId = interaction.values?.[0];
    const result = await finalizeBattle(challenge, cardId);

    const message = await fetchChallengeMessage(challenge);
    await message
      ?.edit({
        embeds: [buildBattleResultEmbed({ challenge, ...result })],
        components: [],
      })
      .catch((error) => logger.debug("Gagal menampilkan hasil duel:", error.message));

    await interaction.update({
      embeds: [
        buildEmbed({
          title: "⚔️ Duel Dimulai!",
          description: `<@${result.winnerId}> memenangkan **🪙 ${result.payout.toLocaleString("id-ID")}**.\nHasil lengkap sudah dikirim di channel.`,
          color: result.winnerId === challenge.defenderId ? COLORS.success : COLORS.error,
        }),
      ],
      components: [],
    });
  }
}
