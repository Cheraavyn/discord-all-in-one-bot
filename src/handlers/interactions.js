import { MessageFlags } from "discord.js";
import { handleTicketComponent } from "../commands/ticket/ticket.js";
import { handleEmbedComponent } from "../commands/settings/embed.js";
import { handleRolePanelComponent } from "../commands/community/rolepanel.js";
import { handleMusicComponent } from "../music/manager.js";
import { fail } from "../lib/embeds.js";
import { BotError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { handlePollComponent } from "../lib/polls.js";
import { handleGiveawayComponent } from "../lib/giveaways.js";
import { handleCardsComponent } from "../commands/cards/cards.js";
import { handleCardBattleComponent } from "../lib/cardBattle.js";

/** customId dengan format "<namespace>:<action>" diarahkan ke handler masing-masing. */
const componentHandlers = new Map([
  ["ticket", handleTicketComponent],
  ["embed", handleEmbedComponent],
  ["rolepanel", handleRolePanelComponent],
  ["poll", handlePollComponent],
  ["giveaway", handleGiveawayComponent],
  ["music", handleMusicComponent],
  ["cardcol", handleCardsComponent],
  ["cardbattle", handleCardBattleComponent],
]);

export async function handleInteraction(interaction) {
  if (interaction.isAutocomplete()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (command?.autocomplete) {
      await command.autocomplete(interaction);
      return;
    }

    await interaction.respond([]).catch(() => {});
    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      await interaction.reply({
        embeds: [fail(`Command \`/${interaction.commandName}\` tidak ditemukan. Coba jalankan \`npm run deploy\` ulang.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await command.execute(interaction);
    return;
  }

  if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
    const [namespace] = interaction.customId.split(":");
    const handler = componentHandlers.get(namespace);

    if (handler) await handler(interaction);
  }
}

export async function replyWithError(interaction, error) {
  const isKnown = error instanceof BotError;

  if (interaction.isAutocomplete()) {
    // 40060/10062 berarti interaksi sudah dijawab/kedaluwarsa (misalnya ada
    // dua proses bot yang menerima event yang sama) — tidak perlu di-log ERROR.
    const ignorable = [40060, 10062].includes(error?.code);
    if (!isKnown && !ignorable) logger.error(`Autocomplete ${interaction.commandName}:`, error);
    await interaction.respond([]).catch(() => {});
    return;
  }

  if (!isKnown) {
    const context = interaction.isChatInputCommand() ? `/${interaction.commandName}` : interaction.customId;
    logger.error(`Error saat menangani ${context}:`, error);
  }

  const payload = {
    embeds: [fail(isKnown ? error.message : "Terjadi kesalahan tak terduga. Cek log bot untuk detailnya.")],
    flags: MessageFlags.Ephemeral,
  };

  try {
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (replyError) {
    // Token interaksi sudah kedaluwarsa/dipakai — tidak ada yang bisa dikirim lagi.
    if (replyError?.code === 10062) {
      logger.debug("Interaksi sudah kedaluwarsa, balasan dilewati:", replyError.message);
      return;
    }
    logger.debug("Gagal mengirim pesan error ke user:", replyError.message);
  }
}
