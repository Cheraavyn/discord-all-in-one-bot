import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import sodium from "libsodium-wrappers";
import { config, validateConfig } from "./config.js";
import { loadCommands } from "./handlers/commands.js";
import { loadEvents } from "./handlers/events.js";
import { initAfk } from "./lib/afk.js";
import { closeBirthdays, initBirthdays } from "./lib/birthdays.js";
import { closeCards, initCards } from "./lib/cards.js";
import { closeEconomy, initEconomy } from "./lib/economy.js";
import { closeFishing, initFishing } from "./lib/fishing.js";
import { initGiveaways } from "./lib/giveaways.js";
import { closeLevels, initLevels } from "./lib/leveling.js";
import { initLockdowns } from "./lib/lockdowns.js";
import { logger } from "./lib/logger.js";
import { closeMining, initMining } from "./lib/mining.js";
import { initModActions } from "./lib/modActions.js";
import { initPolls } from "./lib/polls.js";
import { closeQuests, initQuests } from "./lib/quests.js";
import { closeSettings, initSettings } from "./lib/settings.js";
import { initStarboard } from "./lib/starboard.js";
import { initTempVoice } from "./lib/tempvoice.js";
import { initWarnings } from "./lib/warnings.js";
import { shutdownMusic } from "./music/manager.js";

const problems = validateConfig();

if (problems.length) {
  console.error("\nKonfigurasi bot belum lengkap:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nPerbaiki isi file .env lalu jalankan ulang perintahnya.\n");
  process.exit(1);
}

// libsodium dibutuhkan untuk enkripsi voice channel.
await sodium.ready;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    ...(config.messageContentIntent ? [GatewayIntentBits.MessageContent] : []),
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

client.commands = new Collection();

const NETWORK_ERROR_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_DNS_GETADDRINFO",
]);

function isNetworkError(error) {
  const code = error?.code ?? error?.cause?.code;
  if (NETWORK_ERROR_CODES.has(code)) return true;
  return /getaddrinfo|ENOTFOUND|EAI_AGAIN/i.test(error?.message ?? "");
}

// DNS/jaringan kadang gagal sesaat (Wi-Fi baru nyambung, VPN, dsb). Coba ulang
// beberapa kali sebelum benar-benar menyerah.
async function loginWithRetry(attempts = 3, delayMs = 5000) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await client.login(config.token);
      return;
    } catch (error) {
      if (!isNetworkError(error) || attempt >= attempts) throw error;

      logger.warn(
        `Koneksi ke Discord gagal (${error.code ?? error.message}). Percobaan ulang ${attempt}/${attempts - 1}...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  logger.info(
    `Batas antrean musik: ${
      Number.isFinite(config.maxQueueSize) ? `${config.maxQueueSize} lagu` : "tanpa batas"
    } (MUSIC_MAX_QUEUE=${process.env.MUSIC_MAX_QUEUE ?? "tidak diisi"})`,
  );
  logger.info(
    `Spotify: ${
      config.spotify.clientId && config.spotify.clientSecret
        ? "kredensial terdeteksi"
        : "tanpa kredensial (fallback embed, maksimal ~100 lagu)"
    }`,
  );

  await initSettings();
  await Promise.all([
    initPolls(),
    initWarnings(),
    initModActions(),
    initLockdowns(),
    initTempVoice(),
    initGiveaways(),
    initLevels(),
    initStarboard(),
    initAfk(),
    initEconomy(),
    initCards(),
    initFishing(),
    initMining(),
    initQuests(),
    initBirthdays(),
  ]);

  client.commands = await loadCommands();
  await loadEvents(client);

  await loginWithRetry();
}

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Menerima ${signal}, mematikan bot...`);
  shutdownMusic();

  try {
    client.destroy();
  } catch {
    /* abaikan */
  }

  await closeSettings();
  await closeBirthdays();
  await closeLevels();
  await closeEconomy();
  await closeCards();
  await closeFishing();
  await closeMining();
  await closeQuests();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (error) => logger.error("Unhandled rejection:", error));
process.on("uncaughtException", (error) => logger.error("Uncaught exception:", error));

main().catch((error) => {
  if (error?.code === "TokenInvalid") {
    logger.error("DISCORD_TOKEN tidak valid. Ambil ulang token dari Discord Developer Portal > Bot.");
  } else if (error?.code === "DisallowedIntents") {
    logger.error(
      "Bot meminta privileged intent yang belum diaktifkan. Aktifkan **Server Members Intent** di Discord Developer Portal > Bot. " +
        "Jika memakai MESSAGE_CONTENT_INTENT=true, aktifkan juga **Message Content Intent**.",
    );
  } else if (isNetworkError(error)) {
    logger.error(
      "Tidak bisa terhubung ke Discord (masalah jaringan/DNS). Periksa koneksi internet, matikan VPN/proxy, lalu jalankan ulang.",
    );
    logger.error("Detail:", error);
  } else {
    logger.error("Gagal menjalankan bot:", error);
  }
  process.exit(1);
});
