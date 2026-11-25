import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { discordTimestamp } from "../../lib/duration.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { listReminders } from "../../lib/reminders.js";

export default {
  data: new SlashCommandBuilder()
    .setName("reminders")
    .setDescription("Lihat daftar pengingat aktifmu")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const reminders = await listReminders(interaction.guild.id, interaction.user.id);
    if (!reminders.length) throw new BotError("Kamu belum punya pengingat aktif.");

    const description = reminders
      .map((reminder) => {
        const preview = reminder.message.length > 90 ? `${reminder.message.slice(0, 89)}…` : reminder.message;
        return `\`${reminder.id}\` • ${discordTimestamp(reminder.dueAt)}\n${preview}`;
      })
      .join("\n\n");

    await interaction.reply({
      embeds: [
        buildEmbed({
          title: "Pengingat Aktif",
          description,
          color: COLORS.info,
          footer: `${reminders.length} pengingat • Gunakan /remindcancel untuk membatalkan`,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
