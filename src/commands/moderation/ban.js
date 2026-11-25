import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS, ok } from "../../lib/embeds.js";
import { assertGuildInteraction, assertModeratable } from "../../lib/guards.js";
import { logModeration } from "../../lib/modActions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user dari server")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName("target").setDescription("User yang akan diban").setRequired(true))
    .addStringOption((option) => option.setName("alasan").setDescription("Alasan ban").setMaxLength(512))
    .addIntegerOption((option) =>
      option
        .setName("hapus_pesan")
        .setDescription("Hapus pesan terakhir user (dalam hari, 0-7)")
        .setMinValue(0)
        .setMaxValue(7),
    ),

  async execute(interaction) {
    await interaction.deferReply();
    assertGuildInteraction(interaction, [PermissionFlagsBits.BanMembers]);

    const user = interaction.options.getUser("target", true);
    const reason = interaction.options.getString("alasan") ?? "Tidak ada alasan";
    const deleteDays = interaction.options.getInteger("hapus_pesan") ?? 0;

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) await assertModeratable(interaction, user);

    await user
      .send({
        embeds: [
          buildEmbed({
            title: `Kamu diban dari ${interaction.guild.name}`,
            color: COLORS.error,
            fields: [{ name: "Alasan", value: reason }],
          }),
        ],
      })
      .catch(() => {});

    await interaction.guild.members.ban(user.id, {
      reason: `${reason} — oleh ${interaction.user.tag}`,
      deleteMessageSeconds: deleteDays * 24 * 60 * 60,
    });

    await logModeration(interaction.guild, {
      action: "ban",
      targetId: user.id,
      targetTag: user.tag,
      targetLabel: `${user}`,
      moderator: interaction.user,
      reason,
      color: COLORS.error,
      fields: deleteDays ? [{ name: "Pesan dihapus", value: `${deleteDays} hari`, inline: true }] : [],
    });

    await interaction.editReply({
      embeds: [
        ok(`**${user.tag}** telah diban.`, "User Diban").addFields(
          { name: "Alasan", value: reason },
          { name: "Moderator", value: `${interaction.user}`, inline: true },
          ...(deleteDays ? [{ name: "Pesan dihapus", value: `${deleteDays} hari`, inline: true }] : []),
        ),
      ],
    });
  },
};
