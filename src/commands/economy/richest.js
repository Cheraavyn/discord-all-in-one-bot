import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { formatCoins, getRichest } from "../../lib/economy.js";

const MEDALS = ["🥇", "🥈", "🥉"];

export default {
  data: new SlashCommandBuilder()
    .setName("richest")
    .setDescription("Lihat member dengan koin terbanyak")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((option) =>
      option
        .setName("jumlah")
        .setDescription("Jumlah member yang ditampilkan (1-25, default 10)")
        .setMinValue(1)
        .setMaxValue(25),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const limit = interaction.options.getInteger("jumlah") ?? 10;
    const records = await getRichest(interaction.guild.id, limit);

    if (!records.length) {
      await interaction.reply({
        embeds: [
          buildEmbed({
            title: "Peringkat Koin",
            description: "Belum ada member yang punya koin. Mulai dengan `/daily`.",
            color: COLORS.neutral,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = records.map((record, index) => {
      const member = interaction.guild.members.cache.get(record.userId);
      const name = member?.displayName ?? `<@${record.userId}>`;
      const medal = MEDALS[index] ?? `**${index + 1}.**`;
      return `${medal} ${name} — ${formatCoins(record.balance)}`;
    });

    const embed = buildEmbed({
      title: `Peringkat Koin ${interaction.guild.name}`,
      description: lines.join("\n"),
      color: COLORS.warning,
      thumbnail: interaction.guild.iconURL({ size: 128 }) ?? undefined,
      footer: `${records.length} member teratas`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
