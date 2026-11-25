import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { BotError } from "../../lib/errors.js";
import { COLORS, ok } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { logModeration } from "../../lib/modActions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Cabut ban user berdasarkan ID")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((option) =>
      option.setName("user_id").setDescription("ID user yang akan di-unban").setRequired(true).setMinLength(15),
    )
    .addStringOption((option) => option.setName("alasan").setDescription("Alasan unban").setMaxLength(512)),

  async execute(interaction) {
    await interaction.deferReply();
    assertGuildInteraction(interaction, [PermissionFlagsBits.BanMembers]);

    const userId = interaction.options.getString("user_id", true).trim();
    const reason = interaction.options.getString("alasan") ?? "Tidak ada alasan";

    if (!/^\d{15,25}$/.test(userId)) throw new BotError("ID user tidak valid. Salin ID angka dari profil user.");

    try {
      await interaction.guild.members.unban(userId, `${reason} — oleh ${interaction.user.tag}`);
    } catch (error) {
      if (error.code === 10026) throw new BotError("User tersebut tidak sedang diban di server ini.");
      throw error;
    }

    await logModeration(interaction.guild, {
      action: "unban",
      targetId: userId,
      targetTag: userId,
      targetLabel: `<@${userId}>`,
      moderator: interaction.user,
      reason,
      color: COLORS.success,
    });

    await interaction.editReply({
      embeds: [
        ok(`User <@${userId}> (\`${userId}\`) sudah tidak diban.`, "Unban Berhasil").addFields({
          name: "Alasan",
          value: reason,
        }),
      ],
    });
  },
};
