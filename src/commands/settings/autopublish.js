import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS, ok } from "../../lib/embeds.js";
import { assertGuildInteraction, assertMemberPermissions } from "../../lib/guards.js";
import { getSettings, updateSettings } from "../../lib/settings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("autopublish")
    .setDescription("Publikasikan otomatis pesan di channel pengumuman")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("on").setDescription("Aktifkan auto-publish"))
    .addSubcommand((sub) => sub.setName("off").setDescription("Matikan auto-publish"))
    .addSubcommand((sub) => sub.setName("status").setDescription("Lihat status auto-publish")),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "status") {
      const enabled = getSettings(interaction.guild.id).autopublish.enabled;
      await interaction.reply({
        embeds: [
          buildEmbed({
            title: "Status Auto-publish",
            description: enabled
              ? "Aktif. Pesan di channel pengumuman akan otomatis di-publish."
              : "Mati. Gunakan `/autopublish on` untuk mengaktifkan.",
            color: enabled ? COLORS.success : COLORS.neutral,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const enabled = subcommand === "on";
    if (enabled) assertGuildInteraction(interaction, [PermissionFlagsBits.ManageMessages]);
    updateSettings(interaction.guild.id, { autopublish: { enabled } });

    await interaction.reply({
      embeds: [
        ok(
          enabled
            ? "Auto-publish aktif. Bot akan mem-publish pesan baru di channel pengumuman."
            : "Auto-publish dimatikan.",
          enabled ? "Auto-publish Aktif" : "Auto-publish Dimatikan",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
