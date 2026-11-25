import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { getRank, levelProgress, progressBar, xpForLevel } from "../../lib/leveling.js";
import { getSettings } from "../../lib/settings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Lihat level dan XP seorang member")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName("user").setDescription("Member yang dicek (default: kamu)")),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    if (!getSettings(interaction.guild.id).leveling.enabled) {
      await interaction.reply({
        embeds: [
          buildEmbed({
            title: "Leveling Nonaktif",
            description: "Fitur leveling belum diaktifkan di server ini. Minta moderator menjalankan `/levelconfig enabled:true`.",
            color: COLORS.neutral,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const user = interaction.options.getUser("user") ?? interaction.user;
    const rank = await getRank(interaction.guild.id, user.id);
    const progress = levelProgress(rank.xp);

    const embed = buildEmbed({
      title: `Level ${rank.level} • ${user.username}`,
      color: COLORS.info,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: "XP", value: `${rank.xp} / ${xpForLevel(rank.level + 1)}`, inline: true },
        { name: "Peringkat", value: rank.position ? `#${rank.position}` : "belum ada", inline: true },
        { name: "Pesan ber-XP", value: `${rank.messages}`, inline: true },
        {
          name: `Progres ke level ${rank.level + 1}`,
          value: `${progressBar(progress.percent)} ${progress.percent}%\n${progress.remaining} XP lagi`,
        },
      ],
      footer: `Total XP untuk level berikutnya: ${xpForLevel(rank.level + 1)}`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
