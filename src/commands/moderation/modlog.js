import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { buildEmbed, COLORS, ok } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { formatDuration } from "../../lib/duration.js";
import { assertGuildInteraction, assertMemberPermissions } from "../../lib/guards.js";
import { listLockdowns } from "../../lib/lockdowns.js";
import { getSettings, updateSettings } from "../../lib/settings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("modlog")
    .setDescription("Atur channel log moderasi")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Kirim log moderasi ke sebuah channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel tujuan log")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("off").setDescription("Matikan log moderasi"))
    .addSubcommand((sub) => sub.setName("status").setDescription("Lihat pengaturan log moderasi"))
    .addSubcommand((sub) => sub.setName("test").setDescription("Kirim contoh log ke channel mod log")),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "set") return setLogChannel(interaction);
    if (subcommand === "off") return disableLog(interaction);
    if (subcommand === "test") return testLog(interaction);
    return showStatus(interaction);
  },
};

async function setLogChannel(interaction) {
  const channel = interaction.options.getChannel("channel", true);
  const me = assertGuildInteraction(interaction, [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ]);

  if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new BotError(`Aku butuh izin **Send Messages** dan **Embed Links** di <#${channel.id}>.`);
  }

  updateSettings(interaction.guild.id, { moderation: { logChannelId: channel.id } });

  await interaction.reply({
    embeds: [ok(`Log moderasi akan dikirim ke <#${channel.id}>.`, "Mod Log Diatur")],
    flags: MessageFlags.Ephemeral,
  });
}

async function disableLog(interaction) {
  updateSettings(interaction.guild.id, { moderation: { logChannelId: null } });

  await interaction.reply({
    embeds: [ok("Log moderasi dimatikan.", "Mod Log Dimatikan")],
    flags: MessageFlags.Ephemeral,
  });
}

async function showStatus(interaction) {
  const settings = getSettings(interaction.guild.id);
  const moderation = settings.moderation;
  const locks = await listLockdowns(interaction.guild.id);

  const embed = buildEmbed({
    title: "Pengaturan Moderasi",
    color: COLORS.info,
    fields: [
      {
        name: "Channel mod log",
        value: moderation.logChannelId ? `<#${moderation.logChannelId}>` : "belum diatur",
        inline: true,
      },
      { name: "Auto timeout", value: moderation.warnAutoTimeout ? "Aktif" : "Mati", inline: true },
      { name: "Threshold warning", value: `${moderation.warnThreshold} peringatan`, inline: true },
      { name: "Durasi auto timeout", value: formatDuration(moderation.warnTimeoutMs), inline: true },
      { name: "Channel terkunci", value: `${locks.length}`, inline: true },
    ],
    footer: "Gunakan /warnconfig untuk mengubah aturan warning",
  });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function testLog(interaction) {
  const settings = getSettings(interaction.guild.id);
  const channelId = settings.moderation?.logChannelId;
  if (!channelId) throw new BotError("Mod log belum diatur. Gunakan `/modlog set` dulu.");

  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) throw new BotError("Channel mod log tidak ditemukan atau bukan channel teks.");

  const embed = buildEmbed({
    title: "🛡️ Aksi Moderasi • Contoh",
    description: "Ini contoh tampilan log moderasi. Aksi nyata akan muncul seperti ini.",
    color: COLORS.info,
    fields: [
      { name: "Target", value: `${interaction.user}`, inline: true },
      { name: "Moderator", value: `${interaction.user}`, inline: true },
      { name: "Alasan", value: "Tes konfigurasi mod log" },
    ],
    footer: "ID: contoh",
  });

  await channel.send({ embeds: [embed] });

  await interaction.reply({
    embeds: [ok(`Contoh log dikirim ke <#${channelId}>.`, "Tes Mod Log")],
    flags: MessageFlags.Ephemeral,
  });
}
