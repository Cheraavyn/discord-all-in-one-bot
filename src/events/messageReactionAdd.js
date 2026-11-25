import { Events } from "discord.js";
import { logger } from "../lib/logger.js";
import { handleStarboardReaction } from "../lib/starboard.js";

export default {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    await handleStarboardReaction(reaction, user, true).catch((error) =>
      logger.debug("Gagal memproses reaction starboard:", error.message),
    );
  },
};
