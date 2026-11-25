import { Events } from "discord.js";
import { logger } from "../lib/logger.js";
import { logMessageDelete } from "../lib/messageLog.js";
import { handleStarboardMessageDelete } from "../lib/starboard.js";

export default {
  name: Events.MessageDelete,
  async execute(message) {
    await handleStarboardMessageDelete(message).catch((error) =>
      logger.debug("Gagal membersihkan starboard:", error.message),
    );

    await logMessageDelete(message).catch((error) =>
      logger.debug("Gagal mencatat pesan yang dihapus:", error.message),
    );
  },
};
