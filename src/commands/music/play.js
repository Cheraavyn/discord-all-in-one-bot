import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { config } from "../../config.js";
import { music as musicEmbed } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { formatTimestamp } from "../../lib/duration.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { buildMusicDashboard, enqueueTracks, ensureConnected, getOrCreateQueue, resolveInput, shuffleTracks } from "../../music/manager.js";
import { getSuggestions } from "../../music/suggestions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Putar lagu atau playlist (YouTube, Spotify, SoundCloud)")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Judul lagu, URL YouTube/SoundCloud (termasuk playlist/artis), atau Spotify")
        .setAutocomplete(true)
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("insert")
        .setDescription("Masukkan lagu ke paling atas antrean (default: false)")
        .setRequired(false),
    ),

  async execute(interaction) {
    const voiceChannel = interaction.member.voice?.channel;
    if (!voiceChannel) throw new BotError("Masuk ke voice channel dulu sebelum memutar lagu.");

    assertGuildInteraction(interaction, [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]);

    const me = interaction.guild.members.me;
    const permissions = me ? voiceChannel.permissionsFor(me) : null;
    if (!permissions?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      throw new BotError(`Aku tidak punya izin **Connect** dan **Speak** di ${voiceChannel}.`);
    }

    await interaction.deferReply();

    const query = interaction.options.getString("query", true);
    const insert = interaction.options.getBoolean("insert") ?? false;
    const queue = getOrCreateQueue(interaction.client, interaction.guild);
    const available = config.maxQueueSize - queue.tracks.length;
    if (available <= 0) {
      throw new BotError(`Antrean penuh (maksimal ${config.maxQueueSize} lagu).`);
    }

    const result = await resolveInput(query, interaction.user, available);
    if (!result.tracks.length) {
      throw new BotError("Tidak ada lagu yang bisa diputar dari link itu.");
    }

    queue.textChannelId = interaction.channelId;
    await ensureConnected(queue, voiceChannel);

    // Kalau mode shuffle aktif, acak daftar sebelum antrean diisi supaya lagu
    // pertama dari playlist/artis juga tidak selalu lagu urutan pertama.
    if (queue.shuffle && result.tracks.length > 1) {
      result.tracks = shuffleTracks(result.tracks);
    }

    const wasIdle = !queue.current;
    enqueueTracks(queue, result.tracks, { front: insert });

    const embed =
      result.tracks.length === 1
        ? singleTrackEmbed(result.tracks[0], interaction.user, queue, wasIdle, insert)
        : collectionEmbed(result, interaction.user, queue, wasIdle, insert);

    const components = wasIdle && queue.current ? buildMusicDashboard(queue) : [];
    await interaction.editReply({ embeds: [embed], components });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const query = String(focused.value ?? "");

    // Link yang ditempel tidak perlu saran; biar langsung diproses.
    if (focused.name !== "query" || query.trim().length < 2 || /https?:\/\//i.test(query) || /spotify:/i.test(query)) {
      await interaction.respond([]);
      return;
    }

    const choices = await getSuggestions(query, 10);
    await interaction.respond(choices);
  },
};

function singleTrackEmbed(track, user, queue, wasIdle, insert) {
  return musicEmbed(
    `**[${track.title}](${track.url})**`,
    wasIdle ? "Memutar Lagu" : insert ? "Ditambahkan ke Atas Antrean" : "Ditambahkan ke Antrean",
  )
    .setThumbnail(track.thumbnail ?? null)
    .addFields(
      { name: "Durasi", value: track.duration ? formatTimestamp(track.duration) : "LIVE", inline: true },
      { name: "Diminta", value: `${user}`, inline: true },
      {
        name: wasIdle ? "Antrean" : "Posisi",
        value: wasIdle
          ? `${queue.tracks.length} lagu menunggu`
          : insert
            ? "#1 (paling atas)"
            : `#${queue.tracks.length}`,
        inline: true,
      },
      ...(track.playlist ? [{ name: "Sumber", value: track.playlist }] : []),
    );
}

function collectionEmbed(result, user, queue, wasIdle, insert) {
  const preview = result.tracks
    .slice(0, 5)
    .map((track, index) => `**${index + 1}.** ${track.title}`)
    .join("\n");
  const remaining = result.tracks.length - Math.min(5, result.tracks.length);

  const embed = musicEmbed(
    `${preview}${remaining > 0 ? `\n…dan ${remaining} lagu lainnya` : ""}`,
    `${result.name ?? "Daftar Lagu"}${result.type === "playlist" ? " (Playlist)" : ""}`,
  )
    .setThumbnail(result.image ?? null)
    .addFields(
      { name: "Ditambahkan", value: `${result.tracks.length} lagu`, inline: true },
      { name: "Diminta", value: `${user}`, inline: true },
      {
        name: "Status",
        value: wasIdle
          ? "Mulai diputar"
          : insert
            ? `Di atas antrean (${queue.tracks.length} lagu)`
            : `Menunggu (${queue.tracks.length} lagu)`,
        inline: true,
      },
    );

  if (Number.isFinite(config.maxQueueSize) && result.total > result.tracks.length) {
    embed.addFields({
      name: "Catatan",
      value: `Hanya ${result.tracks.length} dari ${result.total} lagu yang dimasukkan karena batas antrean ${config.maxQueueSize} lagu.`,
    });
  } else if (result.limitedBy === "spotify-embed" && result.tracks.length >= 100) {
    embed.addFields({
      name: "Catatan",
      value:
        "Spotify API belum bisa dipakai (akun pemilik app butuh Premium), jadi daftar lagu diambil dari " +
        "halaman embed yang hanya memuat 100 lagu pertama. Audio tetap dari YouTube. Untuk mengambil semua " +
        "lagu, gunakan link playlist YouTube/SoundCloud atau aktifkan Premium.",
    });
  }

  return embed;
}
