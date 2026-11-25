import { ActivityType, Events } from "discord.js";
import { syncGuildCommands } from "../handlers/commandSync.js";
import { startBirthdayScheduler } from "../lib/birthdays.js";
import { restoreGiveaways } from "../lib/giveaways.js";
import { logger } from "../lib/logger.js";
import { restoreReminders } from "../lib/reminders.js";
import { startServerStats } from "../lib/serverStats.js";
import { restoreTempVoice } from "../lib/tempvoice.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.ready(`Login sebagai ${client.user.tag}`);
    logger.info(`Melayani ${client.guilds.cache.size} server • ${client.commands.size} command tersedia.`);

    client.user.setPresence({
      status: "online",
      activities: [{ name: "/help", type: ActivityType.Listening }],
    });

    await restoreReminders(client);
    await restoreGiveaways(client);
    await restoreTempVoice(client);
    startServerStats(client);
    startBirthdayScheduler(client);

    // Pastikan command di setiap server sama dengan kode terbaru dan langsung
    // bisa dipakai semua member (command global butuh waktu propagasi).
    const updated = await syncGuildCommands(client);
    if (updated) logger.info(`${updated} server diperbarui slash command-nya.`);
  },
};
