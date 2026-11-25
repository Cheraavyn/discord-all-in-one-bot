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
    .setName("starboard")
    .setDescription("Atur channel dan aturan starboard")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Aktifkan starboard di sebuah channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel tujuan starboard")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("off").setDescription("Matikan starboard"))
    .addSubcommand((sub) => sub.setName("status").setDescription("Lihat pengaturan starboard"))
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Ubah threshold, emoji, atau izin self-star")
        .addIntegerOption((option) =>
          option.setName("threshold").setDescription("Jumlah bintang minimal (1-20)").setMinValue(1).setMaxValue(20),
        )
        .addStringOption((option) =>
          option.setName("emoji").setDescription("Emoji yang dipakai (default ⭐)").setMaxLength(50),
        )
        .addBooleanOption((option) =>
          option.setName("selfstar").setDescription("Izinkan author memberi bintang ke pesannya sendiri"),
        ),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "set") return setChannel(interaction);
    if (subcommand === "off") return disable(interaction);
    if (subcommand === "config") return configure(interaction);
    return showStatus(interaction);
  },
};

async function setChannel(interaction) {
  const channel = interaction.options.getChannel("channel", true);
  const me = assertGuildInteraction(interaction, [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory,
  ]);

  if (!channel.permissionsFor(me)?.has([
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory,
  ])) {
    throw new BotError(
      `Aku butuh izin **Send Messages**, **Embed Links**, dan **Read Message History** di <#${channel.id}>.`,
    );
  }

  updateSettings(interaction.guild.id, { starboard: { channelId: channel.id } });

  await interaction.reply({
    embeds: [ok(`Starboard akan mengirim pesan populer ke <#${channel.id}>.`, "Starboard Diaktifkan")],
    flags: MessageFlags.Ephemeral,
  });
}

async function disable(interaction) {
  updateSettings(interaction.guild.id, { starboard: { channelId: null } });

  await interaction.reply({
    embeds: [ok("Starboard dimatikan. Pesan yang sudah ada tidak dihapus.", "Starboard Dimatikan")],
    flags: MessageFlags.Ephemeral,
  });
}

async function configure(interaction) {
  const threshold = interaction.options.getInteger("threshold");
  const emoji = interaction.options.getString("emoji")?.trim();
  const selfStar = interaction.options.getBoolean("selfstar");

  if (threshold === null && !emoji && selfStar === null) return showStatus(interaction);

  const patch = {};
  if (threshold !== null) patch.threshold = threshold;
  if (emoji) patch.emoji = emoji;
  if (selfStar !== null) patch.selfStar = selfStar;

  updateSettings(interaction.guild.id, { starboard: patch });

  await interaction.reply({
    embeds: [buildStatusEmbed(interaction.guild.id, "Starboard Diperbarui")],
    flags: MessageFlags.Ephemeral,
  });
}

async function showStatus(interaction) {
  await interaction.reply({
    embeds: [buildStatusEmbed(interaction.guild.id, "Pengaturan Starboard")],
    flags: MessageFlags.Ephemeral,
  });
}

function buildStatusEmbed(guildId, title) {
  const starboard = getSettings(guildId).starboard;

  return buildEmbed({
    title,
    color: starboard.channelId ? COLORS.success : COLORS.neutral,
    fields: [
      { name: "Channel", value: starboard.channelId ? `<#${starboard.channelId}>` : "belum diatur", inline: true },
      { name: "Emoji", value: starboard.emoji, inline: true },
      { name: "Threshold", value: `${starboard.threshold} reaksi`, inline: true },
      { name: "Self star", value: starboard.selfStar ? "Diizinkan" : "Tidak diizinkan", inline: true },
    ],
    footer: "Gunakan /starboard set channel:#starboard untuk mengaktifkan",
  });
}
