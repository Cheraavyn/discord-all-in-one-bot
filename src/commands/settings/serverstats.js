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
import {
  disableServerStats,
  refreshServerStats,
  setupServerStats,
} from "../../lib/serverStats.js";
import { getSettings } from "../../lib/settings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("serverstats")
    .setDescription("Channel statistik otomatis (jumlah member, bot, channel)")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Buat channel statistik otomatis")
        .addChannelOption((option) =>
          option
            .setName("kategori")
            .setDescription("Kategori tempat channel statistik dibuat")
            .addChannelTypes(ChannelType.GuildCategory),
        ),
    )
    .addSubcommand((sub) => sub.setName("disable").setDescription("Hapus channel statistik dan matikan fitur"))
    .addSubcommand((sub) => sub.setName("update").setDescription("Perbarui angka statistik sekarang"))
    .addSubcommand((sub) => sub.setName("status").setDescription("Lihat status server stats")),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "setup") return setup(interaction);
    if (subcommand === "disable") return disable(interaction);
    if (subcommand === "update") return update(interaction);
    return status(interaction);
  },
};

async function setup(interaction) {
  const me = assertGuildInteraction(interaction, [PermissionFlagsBits.ManageChannels]);
  const category = interaction.options.getChannel("kategori");

  if (category && !category.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
    throw new BotError("Aku butuh izin **Manage Channels** di kategori tersebut.");
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await setupServerStats(interaction.guild, category);

  await interaction.editReply({
    embeds: [
      ok(
        [
          `Channel statistik dibuat di <#${result.categoryId}>.`,
          `Member: **${result.values.members}** • Manusia: **${result.values.humans}** • Bot: **${result.values.bots}**`,
          "Angka akan diperbarui otomatis setiap 10 menit dan saat member bergabung/keluar.",
        ].join("\n"),
        "Server Stats Aktif",
      ),
    ],
  });
}

async function disable(interaction) {
  assertGuildInteraction(interaction, [PermissionFlagsBits.ManageChannels]);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await disableServerStats(interaction.guild);

  await interaction.editReply({
    embeds: [ok("Channel statistik dihapus dan pembaruan otomatis dimatikan.", "Server Stats Dimatikan")],
  });
}

async function update(interaction) {
  assertGuildInteraction(interaction, [PermissionFlagsBits.ManageChannels]);
  const settings = getSettings(interaction.guild.id).serverStats;

  if (!settings.enabled) {
    await interaction.reply({
      embeds: [
        buildEmbed({
          title: "Server Stats Nonaktif",
          description: "Jalankan `/serverstats setup` untuk membuat channel statistik.",
          color: COLORS.neutral,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const values = await refreshServerStats(interaction.guild, { force: true });

  await interaction.editReply({
    embeds: [
      ok(
        `Statistik diperbarui: **${values.members}** member • **${values.humans}** manusia • **${values.bots}** bot • **${values.channels}** channel.`,
        "Server Stats Diperbarui",
      ),
    ],
  });
}

async function status(interaction) {
  const settings = getSettings(interaction.guild.id).serverStats;

  const channelList = Object.entries(settings.channels ?? {})
    .filter(([, id]) => id)
    .map(([key, id]) => `• ${key}: <#${id}>`)
    .join("\n");

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: "Status Server Stats",
        color: settings.enabled ? COLORS.success : COLORS.neutral,
        fields: [
          { name: "Status", value: settings.enabled ? "Aktif" : "Mati", inline: true },
          {
            name: "Kategori",
            value: settings.categoryId ? `<#${settings.categoryId}>` : "belum diatur",
            inline: true,
          },
          { name: "Channel", value: channelList || "belum ada" },
        ],
        footer: "Pembaruan otomatis setiap 10 menit",
      }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}
