import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import {
  CELESTIAL_PITY,
  ELEMENTS,
  ELEMENT_SKILLS,
  EPIC_PITY,
  GACHA_MULTI_COST,
  GACHA_MULTI_COUNT,
  GACHA_SINGLE_COST,
  LEGENDARY_PITY,
  RARITIES,
  RARITY_RANK,
  cardPower,
  formatCardStats,
} from "../../lib/cardCatalog.js";
import { formatCoins } from "../../lib/economy.js";
import { buildEmbed } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { rollGacha } from "../../lib/cards.js";
import { recordQuestProgress } from "../../lib/quests.js";

export default {
  data: new SlashCommandBuilder()
    .setName("gacha")
    .setDescription("Tarik kartu koleksi dengan koin")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((option) =>
      option
        .setName("jumlah")
        .setDescription("Jumlah tarikan (default 1)")
        .addChoices(
          { name: `1 kartu — ${GACHA_SINGLE_COST} koin`, value: 1 },
          {
            name: `${GACHA_MULTI_COUNT} kartu — ${GACHA_MULTI_COST} koin (hemat ${GACHA_SINGLE_COST * GACHA_MULTI_COUNT - GACHA_MULTI_COST})`,
            value: GACHA_MULTI_COUNT,
          },
        ),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const times = interaction.options.getInteger("jumlah") ?? 1;
    const result = await rollGacha(interaction.guild.id, interaction.user.id, times);
    await recordQuestProgress(interaction.guild.id, interaction.user.id, { gacha_pull: times });

    const embed = times === GACHA_MULTI_COUNT ? multiEmbed(result) : singleEmbed(result);

    await interaction.reply({ embeds: [embed] });
  },
};

function pityText(pitied) {
  if (pitied === "celestial") return "💠 **Pity Celestial terpicu!**";
  if (pitied === "legendary") return "🌟 **Pity Legendary terpicu!**";
  if (pitied === "epic") return "🌟 **Pity Epic terpicu!**";
  return null;
}

function singleEmbed(result) {
  const { card, isNew, pitied } = result.results[0];
  const rarity = RARITIES[card.rarity];
  const element = ELEMENTS[card.element];
  const beats = ELEMENTS[element.beats];
  const skill = ELEMENT_SKILLS[card.element];
  const notes = [isNew ? "✨ **KARTU BARU!**" : null, pityText(pitied)].filter(Boolean);

  return buildEmbed({
    title: `${rarity.emoji} ${card.emoji} ${card.name}`,
    description: [`*${card.flavor}*`, notes.length ? `\n${notes.join("\n")}` : ""].join(""),
    color: rarity.color,
    fields: [
      { name: "Rarity", value: `${rarity.emoji} ${rarity.label}`, inline: true },
      { name: "Elemen", value: `${element.emoji} ${element.label}`, inline: true },
      { name: "Power", value: `**${cardPower(card)}**`, inline: true },
      { name: "Statistik", value: formatCardStats(card) },
      { name: `${skill.emoji} Skill — ${skill.name}`, value: skill.description },
      { name: "Elemen unggul", value: `${element.emoji} mengalahkan ${beats.emoji} ${beats.label}`, inline: true },
      { name: "Nilai jual", value: formatCoins(rarity.sell), inline: true },
    ],
    footer: `Saldo ${formatCoins(result.balance)} · Pity Epic ${result.pityEpic}/${EPIC_PITY} · Legendary ${result.pityLegend}/${LEGENDARY_PITY} · Celestial ${result.pityCelestial}/${CELESTIAL_PITY}`,
  });
}

function multiEmbed(result) {
  const best = result.results.reduce((top, entry) =>
    RARITY_RANK[entry.card.rarity] > RARITY_RANK[top.card.rarity] ? entry : top,
  );

  const lines = result.results.map(({ card, isNew, pitied }, index) => {
    const rarity = RARITIES[card.rarity];
    const marks = [isNew ? "✨BARU" : null, pitied ? "🌟PITY" : null].filter(Boolean).join(" ");
    return `${String(index + 1).padStart(2, " ")}. ${rarity.emoji} ${card.emoji} **${card.name}**${marks ? ` — ${marks}` : ""}`;
  });

  const epicPlus = result.results.filter(
    (entry) => RARITY_RANK[entry.card.rarity] >= RARITY_RANK.epic,
  ).length;
  const legendaryPlus = result.results.filter(
    (entry) => RARITY_RANK[entry.card.rarity] >= RARITY_RANK.legendary,
  ).length;
  const newCount = result.results.filter((entry) => entry.isNew).length;

  return buildEmbed({
    title: `🎴 Hasil ${result.results.length}x Gacha`,
    description: lines.join("\n"),
    color: RARITIES[best.card.rarity].color,
    fields: [
      { name: "Terbaik", value: `${RARITIES[best.card.rarity].emoji} ${best.card.emoji} **${best.card.name}**`, inline: true },
      { name: "Epic+", value: `**${epicPlus}** kartu`, inline: true },
      { name: "Legendary+", value: `**${legendaryPlus}** kartu`, inline: true },
      { name: "Kartu baru", value: `**${newCount}** kartu`, inline: true },
      { name: "Biaya", value: formatCoins(result.cost), inline: true },
      { name: "Saldo", value: formatCoins(result.balance), inline: true },
    ],
    footer: `Pity Epic ${result.pityEpic}/${EPIC_PITY} · Legendary ${result.pityLegend}/${LEGENDARY_PITY} · Celestial ${result.pityCelestial}/${CELESTIAL_PITY} · /cards odds untuk peluang`,
  });
}
