import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { buildEmbed, COLORS, ok } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction, assertMemberPermissions } from "../../lib/guards.js";
import { getSettings, updateSettings } from "../../lib/settings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("messagelog")
    .setDescription("Catat pesan yang dihapus atau diedit")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Tentukan channel log pesan")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel tujuan log")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("events")
        .setDescription("Aktifkan/matikan log hapus atau edit")
        .addBooleanOption((option) => option.setName("deleted").setDescription("Catat pesan yang dihapus"))
        .addBooleanOption((option) => option.setName("edited").setDescription("Catat pesan yang diedit")),
    )
    .addSubcommand((sub) => sub.setName("off").setDescription("Matikan message log"))
    .addSubcommand((sub) => sub.setName("status").setDescription("Lihat pengaturan message log")),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "set") return setChannel(interaction);
    if (subcommand === "events") return setEvents(interaction);
    if (subcommand === "off") return disable(interaction);
    return showStatus(interaction);
  },
};

async function setChannel(interaction) {
  const channel = interaction.options.getChannel("channel", true);
  const me = assertGuildInteraction(interaction, [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ]);

  if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new BotError(`Aku butuh izin **Send Messages** dan **Embed Links** di <#${channel.id}>.`);
  }

  updateSettings(interaction.guild.id, { messageLog: { channelId: channel.id } });

  await interaction.reply({
    embeds: [
      ok(
        `Log hapus/edit pesan akan dikirim ke <#${channel.id}>.\nTanpa **Message Content Intent**, isi pesan yang tidak ada di cache akan tampil sebagai *tidak tersedia*.`,
        "Message Log Aktif",
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function setEvents(interaction) {
  const deleted = interaction.options.getBoolean("deleted");
  const edited = interaction.options.getBoolean("edited");

  if (deleted === null && edited === null) return showStatus(interaction);

  const patch = {};
  if (deleted !== null) patch.deleted = deleted;
  if (edited !== null) patch.edited = edited;

  updateSettings(interaction.guild.id, { messageLog: patch });

  await interaction.reply({
    embeds: [buildStatusEmbed(interaction.guild.id, "Message Log Diperbarui")],
    flags: MessageFlags.Ephemeral,
  });
}

async function disable(interaction) {
  updateSettings(interaction.guild.id, { messageLog: { channelId: null } });

  await interaction.reply({
    embeds: [ok("Message log dimatikan.", "Message Log Dimatikan")],
    flags: MessageFlags.Ephemeral,
  });
}

async function showStatus(interaction) {
  await interaction.reply({
    embeds: [buildStatusEmbed(interaction.guild.id, "Pengaturan Message Log")],
    flags: MessageFlags.Ephemeral,
  });
}

function buildStatusEmbed(guildId, title) {
  const log = getSettings(guildId).messageLog;

  return buildEmbed({
    title,
    color: log.channelId ? COLORS.success : COLORS.neutral,
    fields: [
      { name: "Channel", value: log.channelId ? `<#${log.channelId}>` : "belum diatur", inline: true },
      { name: "Log hapus", value: log.deleted ? "Aktif" : "Mati", inline: true },
      { name: "Log edit", value: log.edited ? "Aktif" : "Mati", inline: true },
    ],
    footer: "Hanya pesan member (bukan bot) yang dicatat",
  });
}
