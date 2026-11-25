import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { buildEmbed, COLORS, ok } from "../../lib/embeds.js";
import { formatDuration, parseDuration } from "../../lib/duration.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction, assertMemberPermissions } from "../../lib/guards.js";
import {
  createGiveaway,
  endGiveaway,
  getGiveaway,
  listGiveaways,
} from "../../lib/giveaways.js";

const MAX_GIVEAWAY_MS = 30 * 24 * 60 * 60 * 1000;

export default {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Kelola giveaway dengan tombol peserta")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Mulai giveaway baru")
        .addStringOption((option) =>
          option.setName("hadiah").setDescription("Hadiah giveaway").setRequired(true).setMaxLength(256),
        )
        .addStringOption((option) =>
          option
            .setName("durasi")
            .setDescription("Contoh: 30m, 2h, 1d (maks 30d)")
            .setRequired(true)
            .setMaxLength(20),
        )
        .addIntegerOption((option) =>
          option
            .setName("pemenang")
            .setDescription("Jumlah pemenang (default 1)")
            .setMinValue(1)
            .setMaxValue(20),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel tempat giveaway (default: channel ini)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role yang wajib dimiliki peserta (opsional)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("Akhiri giveaway lebih cepat")
        .addStringOption((option) =>
          option.setName("message_id").setDescription("ID pesan giveaway").setRequired(true).setMinLength(10),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reroll")
        .setDescription("Pilih pemenang giveaway baru")
        .addStringOption((option) =>
          option.setName("message_id").setDescription("ID pesan giveaway").setRequired(true).setMinLength(10),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Lihat giveaway yang sedang berjalan")),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "start") return start(interaction);
    if (subcommand === "end") return finish(interaction, false);
    if (subcommand === "reroll") return finish(interaction, true);
    return list(interaction);
  },
};

async function start(interaction) {
  assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);
  const me = assertGuildInteraction(interaction);

  const prize = interaction.options.getString("hadiah", true).trim();
  const durationInput = interaction.options.getString("durasi", true);
  const winnerCount = interaction.options.getInteger("pemenang") ?? 1;
  const role = interaction.options.getRole("role");
  const channel = interaction.options.getChannel("channel") ?? interaction.channel;

  if (!channel?.isTextBased()) throw new BotError("Channel giveaway harus berupa channel teks.");
  if (channel.isThread()) throw new BotError("Giveaway tidak bisa dijalankan di dalam thread.");

  if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new BotError(`Aku butuh izin **Send Messages** dan **Embed Links** di <#${channel.id}>.`);
  }

  const duration = parseDuration(durationInput);
  if (!duration || duration < 10_000) {
    throw new BotError("Durasi tidak valid. Contoh: `30m`, `2h`, `1d` (minimal 10 detik).");
  }
  if (duration > MAX_GIVEAWAY_MS) throw new BotError("Durasi giveaway maksimal 30 hari.");

  if (role?.managed || role?.id === interaction.guild.roles.everyone.id) {
    throw new BotError("Role syarat tidak boleh role @everyone atau role yang dikelola bot.");
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const giveaway = await createGiveaway(interaction.client, {
    guildId: interaction.guild.id,
    channelId: channel.id,
    channel,
    prize,
    winnerCount,
    hostId: interaction.user.id,
    endsAt: Date.now() + duration,
    requirementRoleId: role?.id ?? null,
  });

  await interaction.editReply({
    embeds: [
      ok(
        [
          `Giveaway **${prize}** dimulai di <#${channel.id}>.`,
          `Berakhir dalam **${formatDuration(duration)}**.`,
          `Pemenang: **${winnerCount}**${role ? ` • Syarat: ${role}` : ""}`,
          `[Buka pesan giveaway](https://discord.com/channels/${interaction.guild.id}/${channel.id}/${giveaway.messageId})`,
        ].join("\n"),
        "Giveaway Dimulai",
      ),
    ],
  });
}

async function finish(interaction, reroll) {
  assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);
  assertGuildInteraction(interaction);

  const messageId = interaction.options.getString("message_id", true).trim();
  const giveaway = getGiveaway(messageId);

  if (!giveaway || giveaway.guildId !== interaction.guild.id) {
    throw new BotError("Giveaway dengan ID pesan tersebut tidak ditemukan di server ini.");
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const winners = await endGiveaway(interaction.client, giveaway, { reroll });

  await interaction.editReply({
    embeds: [
      ok(
        winners.length
          ? `Pemenang: ${winners.map((id) => `<@${id}>`).join(", ")}`
          : "Giveaway berakhir tanpa peserta.",
        reroll ? "Giveaway Di-reroll" : "Giveaway Diakhiri",
      ),
    ],
  });
}

async function list(interaction) {
  const giveaways = await listGiveaways(interaction.guild.id);

  if (!giveaways.length) {
    await interaction.reply({
      embeds: [
        buildEmbed({
          title: "Giveaway Aktif",
          description: "Tidak ada giveaway yang sedang berjalan.",
          color: COLORS.neutral,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const description = giveaways
    .map(
      (giveaway) =>
        `**${giveaway.prize}** • <#${giveaway.channelId}>\n` +
        `> Berakhir <t:${Math.floor(giveaway.endsAt / 1000)}:R> • ${giveaway.participants.length} peserta • ${giveaway.winnerCount} pemenang\n` +
        `> [Buka pesan](https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId})`,
    )
    .join("\n\n");

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: "Giveaway Aktif",
        description,
        color: COLORS.info,
        footer: `ID pesan bisa diambil dari link giveaway`,
      }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}
