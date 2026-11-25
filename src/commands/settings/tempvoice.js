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
import {
  deleteTempChannel,
  getTempVoice,
  listTempChannels,
  pruneTempChannels,
  transferTempVoice,
} from "../../lib/tempvoice.js";

const VOICE_TYPES = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];

export default {
  data: new SlashCommandBuilder()
    .setName("tempvoice")
    .setDescription("Kelola voice channel sementara (join to create)")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Tentukan channel pemicu pembuatan temp voice")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Voice channel yang dijadikan pemicu")
            .addChannelTypes(...VOICE_TYPES)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("kategori")
            .setDescription("Kategori tempat temp voice dibuat (opsional)")
            .addChannelTypes(ChannelType.GuildCategory),
        ),
    )
    .addSubcommand((sub) => sub.setName("disable").setDescription("Matikan temp voice dan hapus channel aktif"))
    .addSubcommand((sub) => sub.setName("status").setDescription("Lihat pengaturan dan temp voice aktif"))
    .addSubcommand((sub) =>
      sub
        .setName("name")
        .setDescription("Ubah nama temp voice milikmu")
        .addStringOption((option) =>
          option.setName("nama").setDescription("Nama channel baru").setRequired(true).setMaxLength(90),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("limit")
        .setDescription("Atur batas jumlah member temp voice milikmu")
        .addIntegerOption((option) =>
          option
            .setName("jumlah")
            .setDescription("0 = tanpa batas")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(99),
        ),
    )
    .addSubcommand((sub) => sub.setName("lock").setDescription("Kunci temp voice milikmu"))
    .addSubcommand((sub) => sub.setName("unlock").setDescription("Buka kunci temp voice milikmu"))
    .addSubcommand((sub) => sub.setName("claim").setDescription("Ambil alih temp voice yang owner-nya sudah pergi")),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") return setup(interaction);
    if (subcommand === "disable") return disable(interaction);
    if (subcommand === "status") return status(interaction);
    if (subcommand === "claim") return claim(interaction);

    return controlChannel(interaction, subcommand);
  },
};

async function setup(interaction) {
  assertMemberPermissions(interaction, [PermissionFlagsBits.ManageChannels]);
  const me = assertGuildInteraction(interaction, [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.MoveMembers,
  ]);

  const channel = interaction.options.getChannel("channel", true);
  const category = interaction.options.getChannel("kategori");

  if (!VOICE_TYPES.includes(channel.type)) {
    throw new BotError("Channel pemicu harus berupa voice channel.");
  }
  if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
    throw new BotError(`Aku butuh izin **Manage Channels** di <#${channel.id}>.`);
  }
  if (category && category.type !== ChannelType.GuildCategory) {
    throw new BotError("Kategori tidak valid.");
  }

  updateSettings(interaction.guild.id, {
    tempVoice: {
      generatorChannelId: channel.id,
      categoryId: category?.id ?? null,
    },
  });

  await interaction.reply({
    embeds: [
      ok(
        [
          `Channel pemicu: <#${channel.id}>`,
          `Kategori temp voice: ${category ? `<#${category.id}>` : "mengikuti kategori channel pemicu"}`,
          "",
          "Member yang join ke channel pemicu akan otomatis mendapat voice channel sendiri.",
        ].join("\n"),
        "Temp Voice Aktif",
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function disable(interaction) {
  assertMemberPermissions(interaction, [PermissionFlagsBits.ManageChannels]);
  assertGuildInteraction(interaction, [PermissionFlagsBits.ManageChannels]);

  const active = await listTempChannels(interaction.guild.id);
  for (const record of active) {
    await deleteTempChannel(interaction.guild, record.channelId, "Temp voice dimatikan");
  }

  updateSettings(interaction.guild.id, { tempVoice: { generatorChannelId: null, categoryId: null } });

  await interaction.reply({
    embeds: [
      ok(
        `${active.length} temp voice aktif dihapus. Fitur temp voice dimatikan.`,
        "Temp Voice Dimatikan",
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function status(interaction) {
  await pruneTempChannels(interaction.guild);

  const settings = getSettings(interaction.guild.id).tempVoice;
  const active = await listTempChannels(interaction.guild.id);

  const embed = buildEmbed({
    title: "Status Temp Voice",
    color: settings.generatorChannelId ? COLORS.success : COLORS.neutral,
    fields: [
      {
        name: "Channel pemicu",
        value: settings.generatorChannelId ? `<#${settings.generatorChannelId}>` : "belum diatur",
        inline: true,
      },
      {
        name: "Kategori",
        value: settings.categoryId ? `<#${settings.categoryId}>` : "mengikuti pemicu",
        inline: true,
      },
      { name: "Channel aktif", value: `${active.length}`, inline: true },
      {
        name: "Daftar channel",
        value: active.length
          ? active
              .slice(0, 15)
              .map((record) => `<#${record.channelId}> • <@${record.ownerId}>`)
              .join("\n")
          : "Tidak ada temp voice aktif.",
      },
    ],
    footer: settings.generatorChannelId
      ? "Gunakan /tempvoice setup untuk mengganti pemicu"
      : "Gunakan /tempvoice setup channel:<voice> untuk mengaktifkan",
  });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function controlChannel(interaction, action) {
  const me = assertGuildInteraction(interaction, [PermissionFlagsBits.ManageChannels]);
  const { channel } = requireOwnChannel(interaction);

  if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
    throw new BotError(`Aku butuh izin **Manage Channels** di <#${channel.id}>.`);
  }

  if (action === "name") {
    const name = interaction.options.getString("nama", true).trim();
    if (!name) throw new BotError("Nama channel tidak boleh kosong.");
    await channel.setName(name.slice(0, 90), `Diubah oleh ${interaction.user.tag}`);
  } else if (action === "limit") {
    const limit = interaction.options.getInteger("jumlah", true);
    await channel.setUserLimit(limit, `Diubah oleh ${interaction.user.tag}`);
  } else if (action === "lock") {
    await channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      { Connect: false },
      { reason: `Temp voice dikunci oleh ${interaction.user.tag}` },
    );
  } else if (action === "unlock") {
    await channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      { Connect: null },
      { reason: `Temp voice dibuka oleh ${interaction.user.tag}` },
    );
  } else {
    throw new BotError("Aksi temp voice tidak dikenal.");
  }

  const messages = {
    name: `Nama channel diubah menjadi **${channel.name}**.`,
    limit: `Batas member diatur ke **${channel.userLimit || "tanpa batas"}**.`,
    lock: "Channel dikunci. Member lain tidak bisa join.",
    unlock: "Channel dibuka kembali.",
  };

  await interaction.reply({
    embeds: [ok(messages[action], "Temp Voice Diperbarui")],
    flags: MessageFlags.Ephemeral,
  });
}

async function claim(interaction) {
  const me = assertGuildInteraction(interaction, [PermissionFlagsBits.ManageChannels]);
  const channel = interaction.member.voice?.channel;

  if (!channel) throw new BotError("Masuk ke temp voice yang ingin kamu ambil alih dulu.");
  const record = getTempVoice(interaction.guild.id, channel.id);
  if (!record) throw new BotError("Channel ini bukan temp voice.");
  if (record.ownerId === interaction.user.id) throw new BotError("Channel ini sudah milikmu.");

  const owner = await interaction.guild.members.fetch(record.ownerId).catch(() => null);
  if (owner?.voice?.channelId === channel.id) {
    throw new BotError("Owner channel masih berada di dalam channel ini.");
  }

  if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
    throw new BotError(`Aku butuh izin **Manage Channels** di <#${channel.id}>.`);
  }

  await transferTempVoice(channel, record.ownerId, interaction.user.id);

  await interaction.reply({
    embeds: [ok(`Kamu sekarang menjadi owner <#${channel.id}>.`, "Temp Voice Diambil Alih")],
    flags: MessageFlags.Ephemeral,
  });
}

function requireOwnChannel(interaction) {
  const channel = interaction.member.voice?.channel;
  if (!channel) throw new BotError("Masuk ke temp voice milikmu dulu.");

  const record = getTempVoice(interaction.guild.id, channel.id);
  if (!record) throw new BotError("Channel ini bukan temp voice.");

  const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
  if (record.ownerId !== interaction.user.id && !isStaff) {
    throw new BotError("Hanya owner channel atau moderator yang bisa mengubah temp voice ini.");
  }

  return { channel, record };
}
