import { ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionContextType, SlashCommandBuilder } from "discord.js";
import {
  BATTLE_MAX_BET,
  BATTLE_MIN_BET,
  BATTLE_TAX_RATE,
  CARDS,
  CARD_MAX_LEVEL,
  CELESTIAL_PITY,
  ELEMENTS,
  ELEMENT_SKILLS,
  EPIC_PITY,
  GACHA_MULTI_COST,
  GACHA_MULTI_COUNT,
  GACHA_SINGLE_COST,
  LEGENDARY_PITY,
  LEVEL_BONUS_RATE,
  RARITIES,
  RARITY_ORDER,
  cardPower,
  effectiveStats,
  getCard,
  getUpgradeCost,
  withCardLevel,
} from "../../lib/cardCatalog.js";
import { getBalance, formatCoins } from "../../lib/economy.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import {
  getBattleLeaderboard,
  getCardAccount,
  getCardLevel,
  getCollectionSummary,
  getOwnedCards,
  sellCard,
  upgradeCard,
} from "../../lib/cards.js";

const PAGE_SIZE = 8;
const RANK_MEDALS = ["🥇", "🥈", "🥉"];

export default {
  data: new SlashCommandBuilder()
    .setName("cards")
    .setDescription("Koleksi kartu: lihat, info, jual, upgrade, rank, dan aturan gacha")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("koleksi")
        .setDescription("Lihat koleksi kartu")
        .addUserOption((option) =>
          option.setName("user").setDescription("Member yang dilihat (default: kamu)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("info")
        .setDescription("Detail satu kartu, skill, dan biaya upgrade")
        .addStringOption((option) =>
          option
            .setName("nama")
            .setDescription("Nama kartu")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("jual")
        .setDescription("Jual salinan kartu menjadi koin")
        .addStringOption((option) =>
          option
            .setName("nama")
            .setDescription("Kartu yang dijual")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("jumlah")
            .setDescription("Jumlah salinan yang dijual (default 1)")
            .setMinValue(1)
            .setMaxValue(999),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("upgrade")
        .setDescription("Naikkan level kartu dengan duplikat + koin")
        .addStringOption((option) =>
          option
            .setName("nama")
            .setDescription("Kartu yang di-upgrade")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("rank")
        .setDescription("Papan peringkat duel kartu server ini"),
    )
    .addSubcommand((sub) =>
      sub.setName("odds").setDescription("Peluang gacha, skill elemen, dan aturan duel"),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "koleksi") return showCollection(interaction);
    if (subcommand === "info") return showCardInfo(interaction);
    if (subcommand === "jual") return sell(interaction);
    if (subcommand === "upgrade") return upgrade(interaction);
    if (subcommand === "rank") return showRank(interaction);
    return showOdds(interaction);
  },

  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused().toLowerCase();
    const account = getCardAccount(interaction.guildId, interaction.user.id);
    const ownedOnly = subcommand === "jual" || subcommand === "upgrade";

    const pool = ownedOnly
      ? getOwnedCards(interaction.guildId, interaction.user.id).filter(
          (entry) => subcommand !== "upgrade" || entry.count > 1,
        )
      : CARDS.map((card) => ({
          card: withCardLevel(card, getCardLevel(interaction.guildId, interaction.user.id, card.id)),
          count: account.cards[card.id] ?? 0,
          level: getCardLevel(interaction.guildId, interaction.user.id, card.id),
        }));

    const choices = pool
      .filter(
        (entry) =>
          entry.card.name.toLowerCase().includes(focused) || entry.card.id.includes(focused),
      )
      .slice(0, 25)
      .map(({ card, count, level }) => {
        const owned = account.cards[card.id] ?? 0;
        const levelText = subcommand === "upgrade" || owned ? ` · Lv.${level}` : "";
        return {
          name: `${card.emoji} ${card.name} — ${RARITIES[card.rarity].label}${levelText}${owned ? ` ×${owned}` : ""}`.slice(0, 100),
          value: card.id,
        };
      });

    await interaction.respond(choices);
  },
};

async function showCollection(interaction) {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const member =
    interaction.guild.members.cache.get(target.id) ??
    (await interaction.guild.members.fetch(target.id).catch(() => null));
  const view = buildCollectionView(
    interaction.guild.id,
    target.id,
    member?.displayName ?? target.username,
    0,
  );

  return interaction.reply(view);
}

export function buildCollectionView(guildId, userId, displayName, page = 0) {
  const summary = getCollectionSummary(guildId, userId);
  const totalPages = Math.max(1, Math.ceil(summary.owned.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, Math.floor(Number(page)) || 0), totalPages - 1);
  const entries = summary.owned.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const list = entries.length
    ? entries
        .map(({ card, count, level, stats }) => {
          const rarity = RARITIES[card.rarity];
          const levelText = level > 1 ? ` · Lv.${level}` : "";
          return `${rarity.emoji} ${card.emoji} **${card.name}**${levelText} ×${count} — ATK ${stats.atk} · DEF ${stats.def} · SPD ${stats.spd}`;
        })
        .join("\n")
    : "Belum ada kartu. Tarik kartu pertamamu dengan `/gacha`.";

  const filled = Math.round((summary.unique / summary.totalCards) * 10);
  const bar = `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
  const rarityBreakdown = RARITY_ORDER.map((rarity) => {
    const unique = summary.owned.filter((entry) => entry.card.rarity === rarity).length;
    const total = CARDS.filter((card) => card.rarity === rarity).length;
    return `${RARITIES[rarity].emoji} ${unique}/${total}`;
  }).join(" · ");
  const leveled = summary.owned.filter((entry) => entry.level > 1).length;

  const embed = buildEmbed({
    title: `🃏 Koleksi ${displayName}`,
    description: [
      `${bar} **${summary.unique}/${summary.totalCards}** kartu unik`,
      `🎴 **${summary.copies}** salinan · 🎲 **${summary.pulls}** pull · ⬆️ **${leveled}** kartu di atas Lv.1`,
      `⚔️ Menang **${summary.wins}** · Kalah **${summary.losses}** · Streak **${summary.streak}** (terbaik **${summary.bestStreak}**)`,
    ].join("\n"),
    color: COLORS.info,
    fields: [
      { name: `Daftar Kartu — Halaman ${current + 1}/${totalPages}`, value: list },
      { name: "Rarity", value: rarityBreakdown },
    ],
    footer: `Koin duel: +${summary.coinsWon.toLocaleString("id-ID")} / -${summary.coinsLost.toLocaleString("id-ID")} · /cards info <nama> untuk detail · /cards upgrade untuk naik level`,
  });

  return {
    embeds: [embed],
    components: buildCollectionComponents(userId, current, totalPages),
  };
}

function buildCollectionComponents(userId, page, totalPages) {
  if (totalPages <= 1) return [];

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cardcol:page:${userId}:${page - 1}`)
        .setLabel("Sebelumnya")
        .setEmoji("◀️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(`cardcol:page:${userId}:${page + 1}`)
        .setLabel("Berikutnya")
        .setEmoji("▶️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
    ),
  ];
}

export async function handleCardsComponent(interaction) {
  const [, action, userId, rawPage] = interaction.customId.split(":");
  if (action !== "page") return;

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  const view = buildCollectionView(
    interaction.guild.id,
    userId,
    member?.displayName ?? `User ${userId}`,
    Number(rawPage),
  );

  await interaction.update(view);
}

function upgradeRequirementText(owned, level) {
  if (!owned) return "Belum dimiliki — tarik kartu ini lewat `/gacha`.";
  if (level >= CARD_MAX_LEVEL) return `Sudah mencapai level maksimum **Lv.${CARD_MAX_LEVEL}**.`;

  const cost = getUpgradeCost(level);
  return [
    `Lv.${cost.from} → **Lv.${cost.to}**`,
    `Butuh **${cost.duplicates}** duplikat + ${formatCoins(cost.coins)}`,
    `Duplikat kamu: **${Math.max(0, owned - 1)}**`,
  ].join("\n");
}

function showCardInfo(interaction) {
  const cardId = interaction.options.getString("nama", true);
  const base = getCard(cardId);

  if (!base) throw new BotError("Kartu tidak ditemukan. Pilih dari daftar autocomplete.");

  const owned = getCardAccount(interaction.guild.id, interaction.user.id).cards[base.id] ?? 0;
  const level = getCardLevel(interaction.guild.id, interaction.user.id, base.id);
  const card = withCardLevel(base, level);
  const stats = effectiveStats(card);
  const rarity = RARITIES[card.rarity];
  const element = ELEMENTS[card.element];
  const beats = ELEMENTS[element.beats];
  const skill = ELEMENT_SKILLS[card.element];
  const losesTo = Object.values(ELEMENTS).find((entry) => entry.beats === card.element);

  const embed = buildEmbed({
    title: `${card.emoji} ${card.name}${level > 1 ? ` · Lv.${level}` : ""}`,
    description: `*${base.flavor}*`,
    color: rarity.color,
    fields: [
      { name: "Rarity", value: `${rarity.emoji} ${rarity.label}`, inline: true },
      { name: "Elemen", value: `${element.emoji} ${element.label}`, inline: true },
      { name: "Level", value: `**Lv.${level}** / ${CARD_MAX_LEVEL}`, inline: true },
      { name: "Power", value: `**${cardPower(card)}**`, inline: true },
      { name: "Statistik", value: `ATK **${stats.atk}** · DEF **${stats.def}** · SPD **${stats.spd}** · HP **${stats.hp}**` },
      { name: `${skill.emoji} Skill — ${skill.name}`, value: skill.description },
      { name: "Elemen unggul", value: `${element.emoji} mengalahkan ${beats.emoji} ${beats.label}` },
      ...(losesTo
        ? [{ name: "Elemen lemah", value: `${losesTo.emoji} ${losesTo.label} mengalahkan ${element.emoji} ${element.label}` }]
        : []),
      { name: "Dimiliki", value: owned ? `**${owned}** salinan` : "Belum dimiliki", inline: true },
      { name: "Nilai jual", value: formatCoins(rarity.sell), inline: true },
      { name: "Upgrade", value: upgradeRequirementText(owned, level) },
    ],
    footer: "Bonus level +8% stat per level · Dapatkan kartu lewat /gacha",
  });

  return interaction.reply({ embeds: [embed] });
}

async function sell(interaction) {
  const cardId = interaction.options.getString("nama", true);
  const amount = interaction.options.getInteger("jumlah") ?? 1;
  const result = await sellCard(interaction.guild.id, interaction.user.id, cardId, amount);
  const balance = getBalance(interaction.guild.id, interaction.user.id);

  const notes = [
    `Kamu menjual **${result.count}x ${result.card.emoji} ${result.card.name}** dan mendapat ${formatCoins(result.coins)}.`,
    `Sisa salinan: **${result.remaining}**`,
    `Saldo sekarang: **${formatCoins(balance)}**`,
  ];
  if (!result.remaining) notes.push("\nKamu tidak lagi memiliki kartu ini.");

  await interaction.reply({
    embeds: [buildEmbed({ title: "💰 Kartu Terjual", description: notes.join("\n"), color: COLORS.success })],
  });
}

async function upgrade(interaction) {
  const cardId = interaction.options.getString("nama", true);
  const result = await upgradeCard(interaction.guild.id, interaction.user.id, cardId);
  const before = effectiveStats(getCard(cardId), result.from);
  const skill = ELEMENT_SKILLS[result.card.element];

  const nextText = result.nextCost
    ? [
        `Lv.${result.nextCost.from} → Lv.${result.nextCost.to}`,
        `Butuh **${result.nextCost.duplicates}** duplikat + ${formatCoins(result.nextCost.coins)}`,
      ].join("\n")
    : `Sudah level maksimum **Lv.${CARD_MAX_LEVEL}**.`;

  const embed = buildEmbed({
    title: `⬆️ ${result.card.emoji} ${result.card.name} Naik ke Lv.${result.to}!`,
    description: [
      `Statistik meningkat **+${Math.round(LEVEL_BONUS_RATE * 100)}%** per level.`,
      `Sisa salinan: **${result.remaining}** · Saldo: **${formatCoins(result.balance)}**`,
    ].join("\n"),
    color: RARITIES[result.card.rarity].color,
    fields: [
      {
        name: "Statistik",
        value: `ATK ${before.atk} → **${result.stats.atk}** · DEF ${before.def} → **${result.stats.def}** · SPD ${before.spd} → **${result.stats.spd}** · HP ${before.hp} → **${result.stats.hp}**`,
      },
      { name: `${skill.emoji} Skill — ${skill.name}`, value: skill.description },
      { name: "Upgrade Berikutnya", value: nextText },
    ],
    footer: `Biaya upgrade: ${formatCoins(result.spentCoins)} + ${result.cost.duplicates} duplikat`,
  });

  await interaction.reply({ embeds: [embed] });
}

async function showRank(interaction) {
  await interaction.deferReply();

  const board = getBattleLeaderboard(interaction.guild.id, 100);
  if (!board.length) {
    await interaction.editReply({
      embeds: [
        buildEmbed({
          title: "🏆 Papan Peringkat Duel",
          description: "Belum ada duel yang selesai di server ini. Jadilah yang pertama dengan `/battle`!",
          color: COLORS.neutral,
        }),
      ],
    });
    return;
  }

  const top = board.slice(0, 10);
  const own = board.find((entry) => entry.userId === interaction.user.id) ?? null;
  const ids = [...new Set([...top.map((entry) => entry.userId), own?.userId].filter(Boolean))];
  const members = await Promise.all(
    ids.map((id) => interaction.guild.members.fetch(id).catch(() => null)),
  );
  const names = new Map(ids.map((id, index) => [id, members[index]?.displayName ?? `User ${id}`]));

  const lines = top.map((entry) => {
    const medal = RANK_MEDALS[entry.rank - 1] ?? `**#${entry.rank}**`;
    return `${medal} **${names.get(entry.userId)}** — ${entry.wins}W/${entry.losses}L · streak terbaik **${entry.bestStreak}** · 🪙 ${entry.coinsWon.toLocaleString("id-ID")}`;
  });

  const fields = [{ name: "10 Besar", value: lines.join("\n") }];
  if (own && own.rank > 10) {
    fields.push({
      name: "Posisi Kamu",
      value: `**#${own.rank}** — ${own.wins}W/${own.losses}L · streak terbaik **${own.bestStreak}** · 🪙 ${own.coinsWon.toLocaleString("id-ID")}`,
    });
  }

  await interaction.editReply({
    embeds: [
      buildEmbed({
        title: "🏆 Papan Peringkat Duel",
        description: `Total **${board.length}** duelis tercatat di server ini.`,
        color: COLORS.music,
        fields,
        footer: "Diurutkan dari kemenangan, lalu streak terbaik, lalu koin hadiah",
      }),
    ],
  });
}

function showOdds(interaction) {
  const odds = RARITY_ORDER.map((rarity) => {
    const meta = RARITIES[rarity];
    const total = CARDS.filter((card) => card.rarity === rarity).length;
    return `${meta.emoji} **${meta.label}** — ${meta.weight}% · ${total} kartu · jual ${formatCoins(meta.sell)}`;
  }).join("\n");

  const elements = Object.values(ELEMENTS)
    .map((element) => `${element.emoji} ${element.label} → ${ELEMENTS[element.beats].emoji} ${ELEMENTS[element.beats].label}`)
    .join("\n");
  const skills = Object.values(ELEMENT_SKILLS)
    .map((skill) => `${skill.emoji} **${skill.name}** — ${skill.description}`)
    .join("\n");

  const embed = buildEmbed({
    title: "🎲 Peluang & Aturan Kartu",
    description: `Total **${CARDS.length}** kartu unik. Tarik dengan \`/gacha\`, lihat koleksi dengan \`/cards koleksi\`, upgrade dengan \`/cards upgrade\`, dan tantang lawan dengan \`/battle\`.`,
    color: COLORS.music,
    fields: [
      { name: "Peluang Rarity", value: odds },
      {
        name: "Pity",
        value: [
          `Epic+ dijamin setiap **${EPIC_PITY}** pull tanpa Epic+.`,
          `Legendary+ dijamin setiap **${LEGENDARY_PITY}** pull tanpa Legendary+.`,
          `Celestial dijamin setiap **${CELESTIAL_PITY}** pull tanpa Celestial.`,
        ].join("\n"),
      },
      {
        name: "Harga Gacha",
        value: [
          `1 pull: ${formatCoins(GACHA_SINGLE_COST)}`,
          `${GACHA_MULTI_COUNT} pull: ${formatCoins(GACHA_MULTI_COST)} (hemat ${formatCoins(GACHA_SINGLE_COST * GACHA_MULTI_COUNT - GACHA_MULTI_COST)})`,
        ].join("\n"),
      },
      { name: "Keunggulan Elemen", value: `${elements}\n\nUnggul memberi **+25% damage**.` },
      { name: "Skill Elemen", value: skills },
      {
        name: "Progresi Kartu",
        value: [
          `Level **1–${CARD_MAX_LEVEL}**, setiap level menambah **+${Math.round(LEVEL_BONUS_RATE * 100)}%** ATK/DEF/SPD/HP.`,
          "Biaya upgrade: **duplikat sebanyak level sekarang** + koin **level × 150**.",
          "Satu salinan selalu disisakan; level tidak hilang saat menjual duplikat.",
        ].join("\n"),
      },
      {
        name: "Duel Kartu",
        value: [
          `Taruhan **${BATTLE_MIN_BET}–${BATTLE_MAX_BET.toLocaleString("id-ID")}** koin per pemain.`,
          `Pemenang mendapat **${Math.round((1 - BATTLE_TAX_RATE) * 100)}%** dari pot; sisanya dibakar.`,
          "Kartu dengan SPD lebih tinggi menyerang lebih dulu. Maksimal 15 ronde.",
          "Lihat papan peringkat dengan `/cards rank`.",
        ].join("\n"),
      },
    ],
    footer: "Semua saldo, kartu, level, dan statistik tersimpan per server",
  });

  return interaction.reply({ embeds: [embed] });
}
