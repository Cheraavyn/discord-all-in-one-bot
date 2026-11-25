import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { BotError } from "../../lib/errors.js";
import { COLORS, ok } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { logModeration } from "../../lib/modActions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Hapus sejumlah pesan di channel ini")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option.setName("jumlah").setDescription("Jumlah pesan (1-100)").setRequired(true).setMinValue(1).setMaxValue(100),
    )
    .addUserOption((option) => option.setName("user").setDescription("Hanya hapus pesan dari user ini")),

  async execute(interaction) {
    assertGuildInteraction(interaction, [PermissionFlagsBits.ManageMessages]);

    if (!interaction.channel?.isTextBased()) throw new BotError("Command ini hanya bisa dipakai di channel teks.");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const amount = interaction.options.getInteger("jumlah", true);
    const user = interaction.options.getUser("user");

    const fetched = await interaction.channel.messages.fetch({ limit: 100 });
    const candidates = user ? fetched.filter((message) => message.author.id === user.id) : fetched;
    const messages = [...candidates.values()].slice(0, amount);

    if (!messages.length) throw new BotError("Tidak ada pesan yang bisa dihapus.");

    const deleted = await interaction.channel.bulkDelete(messages, true);

    await logModeration(interaction.guild, {
      action: "purge",
      targetId: user?.id ?? interaction.channel.id,
      targetTag: user?.tag ?? `#${interaction.channel.name}`,
      targetLabel: user ? `${user}` : `<#${interaction.channel.id}>`,
      moderator: interaction.user,
      reason: user ? `Menghapus pesan dari ${user.tag}` : "Menghapus pesan di channel",
      color: COLORS.warning,
      fields: [
        { name: "Jumlah dihapus", value: `${deleted.size}`, inline: true },
        { name: "Channel", value: `<#${interaction.channel.id}>`, inline: true },
      ],
    });

    await interaction.editReply({
      embeds: [
        ok(
          `**${deleted.size}** pesan berhasil dihapus${user ? ` dari ${user}` : ""}.` +
            (deleted.size < messages.length ? "\nPesan yang lebih tua dari 14 hari tidak bisa dihapus." : ""),
        ),
      ],
    });
  },
};
