import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import {
  buildPollComponents,
  buildPollEmbed,
  createPoll,
  MAX_POLL_OPTIONS,
} from "../../lib/polls.js";

export default {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Buat polling dengan tombol pilihan")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option.setName("pertanyaan").setDescription("Pertanyaan polling").setRequired(true).setMaxLength(256),
    )
    .addStringOption((option) =>
      option
        .setName("pilihan")
        .setDescription("Pisahkan dengan | contoh: Ya | Tidak | Ragu")
        .setRequired(true)
        .setMaxLength(2000),
    )
    .addBooleanOption((option) =>
      option.setName("multi").setDescription("Izinkan memilih lebih dari satu pilihan"),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const question = interaction.options.getString("pertanyaan", true).trim();
    const rawOptions = interaction.options.getString("pilihan", true);
    const options = rawOptions
      .split("|")
      .map((option) => option.trim())
      .filter(Boolean);

    if (options.length < 2) throw new BotError("Isi minimal 2 pilihan, pisahkan dengan `|`.");
    if (options.length > MAX_POLL_OPTIONS) throw new BotError(`Maksimal ${MAX_POLL_OPTIONS} pilihan.`);
    if (options.some((option) => option.length > 100)) {
      throw new BotError("Setiap pilihan maksimal 100 karakter.");
    }
    if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
      throw new BotError("Pilihan tidak boleh ada yang sama.");
    }

    const poll = {
      messageId: null,
      guildId: interaction.guild.id,
      channelId: interaction.channelId,
      question,
      options,
      multiple: interaction.options.getBoolean("multi") ?? false,
      creatorId: interaction.user.id,
    };

    const message = await interaction.reply({
      embeds: [buildPollEmbed({ ...poll, votes: {}, closed: false })],
      components: buildPollComponents({ ...poll, votes: {}, closed: false }),
      fetchReply: true,
    });

    poll.messageId = message.id;
    await createPoll(poll);
  },
};
