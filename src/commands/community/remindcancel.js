import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { discordTimestamp } from "../../lib/duration.js";
import { ok } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { cancelReminder } from "../../lib/reminders.js";

export default {
  data: new SlashCommandBuilder()
    .setName("remindcancel")
    .setDescription("Batalkan pengingat yang sudah dibuat")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("id")
        .setDescription("ID pengingat (lihat dengan /reminders)")
        .setRequired(true)
        .setMaxLength(20),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const id = interaction.options.getString("id", true).trim();
    const reminder = await cancelReminder(interaction.guild.id, interaction.user.id, id);

    await interaction.reply({
      embeds: [
        ok(
          `Pengingat \`${reminder.id}\` (${discordTimestamp(reminder.dueAt)}) dibatalkan.\n\n**${reminder.message}**`,
          "Pengingat Dibatalkan",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
