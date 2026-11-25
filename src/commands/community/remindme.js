import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { discordTimestamp, formatDuration, parseDuration } from "../../lib/duration.js";
import { ok } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { createReminder, MAX_REMINDER_MS } from "../../lib/reminders.js";

export default {
  data: new SlashCommandBuilder()
    .setName("remindme")
    .setDescription("Buat pengingat pribadi")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("waktu")
        .setDescription("Kapan pengingat dikirim, contoh: 10m, 2h, 1d")
        .setRequired(true)
        .setMaxLength(20),
    )
    .addStringOption((option) =>
      option.setName("pesan").setDescription("Isi pengingat").setRequired(true).setMaxLength(1000),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const input = interaction.options.getString("waktu", true);
    const ms = parseDuration(input);
    if (!ms) throw new BotError("Format waktu tidak valid. Contoh: `10m`, `2h`, `1d`.");
    if (ms < 10_000) throw new BotError("Minimal 10 detik.");
    if (ms > MAX_REMINDER_MS) throw new BotError("Maksimal pengingat adalah 30 hari.");

    const message = interaction.options.getString("pesan", true).trim();
    if (!message) throw new BotError("Isi pesan pengingat tidak boleh kosong.");

    const reminder = await createReminder({
      client: interaction.client,
      guildId: interaction.guild.id,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      message,
      dueAt: Date.now() + ms,
    });

    await interaction.reply({
      embeds: [
        ok(
          [
            `Aku akan mengingatkanmu ${discordTimestamp(reminder.dueAt)} (${formatDuration(ms)} lagi).`,
            "",
            `**${reminder.message}**`,
            "",
            `ID pengingat: \`${reminder.id}\``,
          ].join("\n"),
          "Pengingat Dibuat",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
