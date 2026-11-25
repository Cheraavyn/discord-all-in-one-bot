import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { music as musicEmbed } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import {
  assertSameVoiceChannel,
  getQueue,
  getShufflePreference,
  setShuffleForGuild,
} from "../../music/manager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Aktifkan atau matikan mode acak antrean")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Kosongkan untuk toggle on/off")
        .addChoices({ name: "On - acak terus", value: "on" }, { name: "Off - urutan normal", value: "off" }),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const guildId = interaction.guild.id;
    const queue = getQueue(guildId);

    // Cek voice hanya kalau bot sedang memutar musik.
    if (queue?.connection) assertSameVoiceChannel(interaction, queue);

    const mode = interaction.options.getString("mode");
    const current = queue ? Boolean(queue.shuffle) : getShufflePreference(guildId);
    const enabled = mode ? mode === "on" : !current;

    const result = setShuffleForGuild(guildId, enabled);

    const lines = result.enabled
      ? [
          "🔀 Mode shuffle **aktif**.",
          result.count
            ? `**${result.count}** lagu di antrean langsung diacak.`
            : "Lagu berikutnya akan diputar secara acak.",
          result.hasQueue ? null : "Mode ini otomatis dipakai saat kamu mulai memutar lagu/playlist.",
        ]
      : ["Mode shuffle **dimatikan**. Lagu kembali diputar sesuai urutan."];

    await interaction.reply({
      embeds: [musicEmbed(lines.filter(Boolean).join("\n"), "Shuffle")],
      flags: MessageFlags.Ephemeral,
    });
  },
};
