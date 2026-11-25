import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction, assertMemberPermissions } from "../../lib/guards.js";
import { getSettings, updateSettings } from "../../lib/settings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("levelconfig")
    .setDescription("Atur sistem leveling server")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((option) => option.setName("enabled").setDescription("Aktifkan atau matikan leveling"))
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel pengumuman level up (kosongkan = channel tempat chat)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addBooleanOption((option) =>
      option.setName("announce").setDescription("Kirim pesan saat member naik level"),
    )
    .addIntegerOption((option) =>
      option
        .setName("cooldown")
        .setDescription("Jeda minimal antar XP dalam detik (10-600)")
        .setMinValue(10)
        .setMaxValue(600),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);

    const enabled = interaction.options.getBoolean("enabled");
    const channel = interaction.options.getChannel("channel");
    const announce = interaction.options.getBoolean("announce");
    const cooldown = interaction.options.getInteger("cooldown");

    if (enabled === null && !channel && announce === null && cooldown === null) {
      return showConfig(interaction);
    }

    if (channel && !channel.isTextBased()) throw new BotError("Channel pengumuman harus berupa channel teks.");

    const patch = {};
    if (enabled !== null) patch.enabled = enabled;
    if (announce !== null) patch.announce = announce;
    if (cooldown !== null) patch.cooldownMs = cooldown * 1000;
    if (channel) patch.announceChannelId = channel.id;

    const me = assertGuildInteraction(interaction, [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
    if (channel && !channel.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      throw new BotError(`Aku butuh izin **Send Messages** dan **Embed Links** di <#${channel.id}>.`);
    }

    updateSettings(interaction.guild.id, { leveling: patch });

    await interaction.reply({
      embeds: [buildConfigEmbed(interaction.guild.id, "Leveling Diperbarui")],
      flags: MessageFlags.Ephemeral,
    });
  },
};

function showConfig(interaction) {
  return interaction.reply({
    embeds: [buildConfigEmbed(interaction.guild.id, "Pengaturan Leveling")],
    flags: MessageFlags.Ephemeral,
  });
}

function buildConfigEmbed(guildId, title) {
  const leveling = getSettings(guildId).leveling;

  return buildEmbed({
    title,
    color: leveling.enabled ? COLORS.success : COLORS.neutral,
    fields: [
      { name: "Status", value: leveling.enabled ? "Aktif" : "Mati", inline: true },
      { name: "Pengumuman level up", value: leveling.announce ? "Aktif" : "Mati", inline: true },
      { name: "Channel pengumuman", value: leveling.announceChannelId ? `<#${leveling.announceChannelId}>` : "channel chat", inline: true },
      { name: "Cooldown XP", value: `${Math.round(leveling.cooldownMs / 1000)} detik`, inline: true },
      { name: "XP per pesan", value: "15-25 XP", inline: true },
    ],
    footer: "XP hanya diberikan untuk pesan di server, bukan DM",
  });
}
