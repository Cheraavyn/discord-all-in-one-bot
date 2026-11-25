import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { info, ok } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { getSettings, updateSettings } from "../../lib/settings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Atur role otomatis untuk member baru")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Aktifkan auto role")
        .addRoleOption((option) => option.setName("role").setDescription("Role yang diberikan").setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName("off").setDescription("Matikan auto role"))
    .addSubcommand((sub) => sub.setName("status").setDescription("Lihat pengaturan auto role")),

  async execute(interaction) {
    const me = assertGuildInteraction(interaction, [PermissionFlagsBits.ManageRoles]);
    const subcommand = interaction.options.getSubcommand();
    const settings = getSettings(interaction.guild.id);

    if (subcommand === "set") {
      const role = interaction.options.getRole("role", true);

      if (role.id === interaction.guild.id) throw new BotError("Role `@everyone` tidak bisa dipakai sebagai auto role.");
      if (role.managed) throw new BotError("Role ini dikelola oleh integrasi/bot lain, jadi tidak bisa diberikan manual.");
      if (role.position >= me.roles.highest.position) {
        throw new BotError(`Role **${role.name}** lebih tinggi dari role-ku. Pindahkan role bot ke atas role tersebut.`);
      }

      updateSettings(interaction.guild.id, { autoRole: { roleId: role.id } });

      await interaction.reply({
        embeds: [ok(`Member baru otomatis mendapat role **${role.name}**.`, "Auto Role Diaktifkan")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "off") {
      updateSettings(interaction.guild.id, { autoRole: { roleId: null } });
      await interaction.reply({ embeds: [ok("Auto role dimatikan.")], flags: MessageFlags.Ephemeral });
      return;
    }

    const roleText = settings.autoRole.roleId ? `<@&${settings.autoRole.roleId}>` : "belum diatur";
    await interaction.reply({
      embeds: [info(`**Auto role:** ${roleText}`, "Pengaturan Auto Role")],
      flags: MessageFlags.Ephemeral,
    });
  },
};
