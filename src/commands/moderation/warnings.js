import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { discordTimestamp } from "../../lib/duration.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { listWarnings } from "../../lib/warnings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Lihat daftar peringatan seorang member")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("target").setDescription("Member yang dicek").setRequired(true)),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const user = interaction.options.getUser("target", true);
    const warnings = await listWarnings(interaction.guild.id, user.id);

    if (!warnings.length) {
      await interaction.reply({
        embeds: [buildEmbed({ title: "Peringatan", description: `${user} tidak punya peringatan aktif.`, color: COLORS.success })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const description = warnings
      .slice(0, 15)
      .map(
        (warning, index) =>
          `**${index + 1}.** \`${warning.id}\` • ${discordTimestamp(warning.createdAt)}\n` +
          `> ${warning.reason}\n> oleh <@${warning.moderatorId}>`,
      )
      .join("\n\n");

    await interaction.reply({
      embeds: [
        buildEmbed({
          title: `Peringatan ${user.tag}`,
          description,
          color: COLORS.warning,
          footer: `${warnings.length} peringatan aktif${warnings.length > 15 ? " • hanya 15 terbaru ditampilkan" : ""}`,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
