import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { music as musicEmbed } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { formatTimestamp } from "../../lib/duration.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { getQueue, trackSummary } from "../../music/manager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Lihat antrean lagu")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const queue = getQueue(interaction.guild.id);
    if (!queue || (!queue.current && !queue.tracks.length)) throw new BotError("Antrean sedang kosong.");

    const upcoming = queue.tracks.slice(0, 10);
    const totalSeconds =
      (queue.current?.duration ?? 0) + queue.tracks.reduce((total, track) => total + (track.duration ?? 0), 0);

    const embed = musicEmbed(
      upcoming.length
        ? upcoming.map((track, index) => `**${index + 1}.** ${trackSummary(track)}`).join("\n")
        : "Tidak ada lagu berikutnya.",
      "Antrean Lagu",
    );

    if (queue.current) {
      embed.addFields({ name: "Sedang diputar", value: trackSummary(queue.current) });
    }

    embed.setFooter({
      text: `${queue.tracks.length} lagu menunggu • Total ${formatTimestamp(totalSeconds)} • Volume ${queue.volume}% • Shuffle ${queue.shuffle ? "On" : "Off"}`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
