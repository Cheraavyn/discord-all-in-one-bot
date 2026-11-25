import { Events } from "discord.js";
import { syncGuildCommands } from "../handlers/commandSync.js";

export default {
  name: Events.GuildCreate,
  async execute(guild) {
    // Daftarkan command khusus server ini supaya member baru tidak perlu
    // menunggu propagasi command global.
    await syncGuildCommands(guild.client, guild.id);
  },
};
