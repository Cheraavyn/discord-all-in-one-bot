import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { discordTimestamp } from "../../lib/duration.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { assertGuildInteraction, truncate } from "../../lib/guards.js";
import { actionLabel, countModActions, listModActions } from "../../lib/modActions.js";
import { listWarnings } from "../../lib/warnings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("Lihat riwayat moderasi seorang member")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("target").setDescription("Member yang dicek").setRequired(true)),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const user = interaction.options.getUser("target", true);
    const guildId = interaction.guild.id;
    const [warnings, actions, totalActions] = await Promise.all([
      listWarnings(guildId, user.id),
      listModActions(guildId, user.id, 10),
      countModActions(guildId, user.id),
    ]);

    const warningText = warnings.length
      ? warnings
          .slice(0, 5)
          .map(
            (warning) =>
              `\`${warning.id}\` • ${discordTimestamp(warning.createdAt)} • ${warning.reason} — <@${warning.moderatorId}>`,
          )
          .join("\n") + (warnings.length > 5 ? `\n…dan ${warnings.length - 5} peringatan lain` : "")
      : "Tidak ada peringatan aktif.";

    const actionText = actions.length
      ? actions
          .map((record) => {
            const moderator = record.moderatorId ? `<@${record.moderatorId}>` : "Sistem";
            return `**${actionLabel(record.action)}** • ${discordTimestamp(record.createdAt)} • ${moderator}\n> ${record.reason}`;
          })
          .join("\n")
      : "Belum ada aksi moderasi yang tercatat.";

    const embed = buildEmbed({
      title: `Riwayat ${user.tag}`,
      color: COLORS.info,
      fields: [
        {
          name: `Peringatan Aktif (${warnings.length})`,
          value: truncate(warningText, 1024),
        },
        {
          name: `Aksi Moderasi Terakhir (${Math.min(actions.length, 10)} dari ${totalActions})`,
          value: truncate(actionText, 1024),
        },
      ],
      footer: `ID: ${user.id}`,
    });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
