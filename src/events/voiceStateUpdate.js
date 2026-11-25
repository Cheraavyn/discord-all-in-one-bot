import { Events } from "discord.js";
import { logger } from "../lib/logger.js";
import { handleTempVoiceUpdate } from "../lib/tempvoice.js";
import { handleVoiceStateUpdate } from "../music/manager.js";

export default {
  name: Events.VoiceStateUpdate,
  execute(oldState, newState) {
    handleVoiceStateUpdate(oldState);
    void handleTempVoiceUpdate(oldState, newState).catch((error) =>
      logger.debug("Gagal memproses temp voice:", error.message),
    );
  },
};
