import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS, ok } from "../../lib/embeds.js";
import { assertGuildInteraction, assertModeratable } from "../../lib/guards.js";
import { logModeration } from "../../lib/modActions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Keluarkan member dari server")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName("target").setDescription("Member yang akan dikick").setRequired(true))
    .addStringOption((option) => option.setName("alasan").setDescription("Alasan kick").setMaxLength(512)),

  async execute(interaction) {
    await interaction.deferReply();
    assertGuildInteraction(interaction, [PermissionFlagsBits.KickMembers]);

    const user = interaction.options.getUser("target", true);
    const reason = interaction.options.getString("alasan") ?? "Tidak ada alasan";
    const target = await assertModeratable(interaction, user);

    await user
      .send({
        embeds: [
          buildEmbed({
            title: `Kamu dikeluarkan dari ${interaction.guild.name}`,
            color: COLORS.warning,
            fields: [{ name: "Alasan", value: reason }],
          }),
        ],
      })
      .catch(() => {});

    await target.kick(`${reason} — oleh ${interaction.user.tag}`);

    await logModeration(interaction.guild, {
      action: "kick",
      targetId: user.id,
      targetTag: user.tag,
      targetLabel: `${user}`,
      moderator: interaction.user,
      reason,
      color: COLORS.error,
    });

    await interaction.editReply({
      embeds: [
        ok(`**${user.tag}** telah dikeluarkan dari server.`, "Kick Berhasil").addFields(
          { name: "Alasan", value: reason },
          { name: "Moderator", value: `${interaction.user}`, inline: true },
        ),
      ],
    });
  },
};
