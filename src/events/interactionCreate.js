import { Events } from "discord.js";
import { handleInteraction, replyWithError } from "../handlers/interactions.js";

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      await handleInteraction(interaction);
    } catch (error) {
      await replyWithError(interaction, error);
    }
  },
};
