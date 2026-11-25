import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { music as musicEmbed } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { formatTimestamp } from "../../lib/duration.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import {
  buildMusicDashboard,
  ensureConnected,
  getOrCreateQueue,
  queueNext,
  resolveInput,
} from "../../music/manager.js";
import { getSuggestions } from "../../music/suggestions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("playnext")
    .setDescription("Putar lagu ini tepat setelah lagu yang sedang berjalan")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Judul lagu atau URL YouTube/SoundCloud/Spotify")
        .setRequired(true)
        .setAutocomplete(true),
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
    const queue = getOrCreateQueue(interaction.client, interaction.guild);
    const result = await resolveInput(query, interaction.user, 1);
    const track = result.tracks[0];
    if (!track) throw new BotError("Tidak ada lagu yang bisa diputar dari input itu.");

    queue.textChannelId = interaction.channelId;
    await ensureConnected(queue, voiceChannel);

    const wasIdle = !queue.current;
    queueNext(queue, track);

    const embed = musicEmbed(
      `**[${track.title}](${track.url})** ${wasIdle ? "langsung diputar." : "akan diputar berikutnya."}`,
      wasIdle ? "Memutar Lagu" : "Ditambahkan ke Depan Antrean",
    )
      .setThumbnail(track.thumbnail ?? null)
      .addFields(
        { name: "Durasi", value: track.duration ? formatTimestamp(track.duration) : "LIVE", inline: true },
        { name: "Diminta", value: `${interaction.user}`, inline: true },
        {
          name: "Posisi",
          value: wasIdle ? "Sedang diputar" : "#1 (berikutnya)",
          inline: true,
        },
      );

    const components = wasIdle && queue.current ? buildMusicDashboard(queue) : [];
    await interaction.editReply({ embeds: [embed], components });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const query = String(focused.value ?? "");

    if (focused.name !== "query" || query.trim().length < 2 || /https?:\/\//i.test(query) || /spotify:/i.test(query)) {
      await interaction.respond([]);
      return;
    }

    const choices = await getSuggestions(query, 10);
    await interaction.respond(choices);
  },
};
