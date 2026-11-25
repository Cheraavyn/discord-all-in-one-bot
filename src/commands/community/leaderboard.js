import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { getLeaderboard } from "../../lib/leveling.js";
import { getSettings } from "../../lib/settings.js";

const MEDALS = ["🥇", "🥈", "🥉"];

export default {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Lihat peringkat XP member di server ini")
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

    if (!getSettings(interaction.guild.id).leveling.enabled) {
      await interaction.reply({
        embeds: [
          buildEmbed({
            title: "Leveling Nonaktif",
            description: "Fitur leveling belum diaktifkan di server ini.",
            color: COLORS.neutral,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const limit = interaction.options.getInteger("jumlah") ?? 10;
    const records = await getLeaderboard(interaction.guild.id, limit);

    if (!records.length) {
      await interaction.reply({
        embeds: [
          buildEmbed({
            title: "Leaderboard",
            description: "Belum ada member yang mengumpulkan XP.",
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
      return `${medal} ${name} — level **${record.level}** • ${record.xp} XP`;
    });

    const embed = buildEmbed({
      title: `Leaderboard ${interaction.guild.name}`,
      description: lines.join("\n"),
      color: COLORS.info,
      thumbnail: interaction.guild.iconURL({ size: 256 }) ?? undefined,
      footer: `${records.length} member teratas • XP dihitung dari pesan`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
