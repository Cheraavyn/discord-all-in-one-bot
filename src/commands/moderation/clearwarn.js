import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { ok } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { logModeration } from "../../lib/modActions.js";
import { clearWarnings, removeWarning } from "../../lib/warnings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("clearwarn")
    .setDescription("Hapus satu atau semua peringatan member")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("target").setDescription("Member yang peringatannya dihapus").setRequired(true))
    .addStringOption((option) =>
      option.setName("id").setDescription("ID peringatan tertentu (lihat /warnings)").setMaxLength(20),
    )
    .addBooleanOption((option) =>
      option.setName("semua").setDescription("Set true untuk menghapus semua peringatan member"),
    ),

  async execute(interaction) {
    await interaction.deferReply();
    assertGuildInteraction(interaction, [PermissionFlagsBits.ModerateMembers]);

    const user = interaction.options.getUser("target", true);
    const id = interaction.options.getString("id")?.trim();
    const all = interaction.options.getBoolean("semua") ?? false;

    if (!id && !all) throw new BotError("Sebutkan `id` peringatan, atau set `semua:true` untuk menghapus semuanya.");

    if (id) {
      const removed = await removeWarning(interaction.guild.id, user.id, id);

      await logModeration(interaction.guild, {
        action: "warn_clear",
        targetId: user.id,
        targetTag: user.tag,
        targetLabel: `${user}`,
        moderator: interaction.user,
        reason: `Menghapus peringatan \`${removed.id}\``,
        fields: [{ name: "Alasan peringatan", value: removed.reason }],
      });

      await interaction.editReply({
        embeds: [ok(`Peringatan \`${removed.id}\` milik **${user.tag}** dihapus.`, "Peringatan Dihapus")],
      });
      return;
    }

    const count = await clearWarnings(interaction.guild.id, user.id);
    if (!count) throw new BotError(`**${user.tag}** tidak punya peringatan aktif.`);

    await logModeration(interaction.guild, {
      action: "warn_clear_all",
      targetId: user.id,
      targetTag: user.tag,
      targetLabel: `${user}`,
      moderator: interaction.user,
      reason: `Menghapus semua peringatan (${count})`,
      fields: [{ name: "Jumlah dihapus", value: `${count}`, inline: true }],
    });

    await interaction.editReply({
      embeds: [ok(`**${count}** peringatan milik **${user.tag}** dihapus.`, "Semua Peringatan Dihapus")],
    });
  },
};
