import { Events } from "discord.js";
import { logger } from "../lib/logger.js";
import { logMessageEdit } from "../lib/messageLog.js";

export default {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    await logMessageEdit(oldMessage, newMessage).catch((error) =>
      logger.debug("Gagal mencatat pesan yang diedit:", error.message),
    );
  },
};
