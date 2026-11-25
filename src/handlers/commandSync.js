import { REST, Routes } from "discord.js";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { toSlashCommandData } from "./commands.js";

/* Field yang ditambahkan Discord dan tidak perlu ikut dibandingkan. */
const IGNORED_KEYS = new Set([
  "id",
  "application_id",
  "version",
  "guild_id",
  "dm_permission",
  "integration_types",
  "nsfw",
  // Command khusus server selalu hanya berlaku di server, jadi Discord tidak
  // mengembalikan `contexts`; nilainya tidak perlu ikut dibandingkan.
  "contexts",
]);

/**
 * Menyederhanakan payload command agar bentuk lokal (dari SlashCommandBuilder)
 * dan bentuk dari Discord bisa dibandingkan tanpa false-positive.
 */
function canonicalize(value) {
  if (Array.isArray(value)) {
    const items = value.map(canonicalize).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }

  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (IGNORED_KEYS.has(key)) continue;
      const normalized = canonicalize(value[key]);
      if (normalized !== undefined) result[key] = normalized;
    }
    return Object.keys(result).length ? result : undefined;
  }

  // `false`/null/undefined = nilai default, jadi dianggap sama dengan tidak diisi.
  if (value === undefined || value === null || value === false) return undefined;
  return value;
}

function fingerprint(commands) {
  return JSON.stringify(canonicalize(commands));
}

/**
 * Mendaftarkan slash command ke satu server agar langsung tersedia untuk semua
 * member tanpa menunggu propagasi command global (yang bisa sampai 1 jam).
 * Command global tetap dipakai sebagai cadangan lewat `npm run deploy`.
 */
async function syncGuild(rest, guild, body) {
  const route = Routes.applicationGuildCommands(config.clientId, guild.id);

  try {
    const existing = await rest.get(route);
    if (Array.isArray(existing) && fingerprint(existing) === fingerprint(body)) return false;

    await rest.put(route, { body });
    logger.info(`Slash command disinkronkan ke ${guild.name} (${body.length} command).`);
    return true;
  } catch (error) {
    logger.warn(`Gagal menyinkronkan slash command di ${guild.name}: ${error.message}`);
    return false;
  }
}

/**
 * Menyamakan command yang terdaftar di Discord dengan command di folder
 * `src/commands`. Dipanggil saat bot siap dan saat bergabung ke server baru.
 *
 * @param {import("discord.js").Client} client
 * @param {string|null} [guildId] Batasi ke satu server (default: semua server bot).
 * @returns {Promise<number>} jumlah server yang command-nya diperbarui.
 */
export async function syncGuildCommands(client, guildId = config.guildId) {
  const body = toSlashCommandData(client.commands);
  if (!body.length) return 0;

  const targets = guildId
    ? [client.guilds.cache.get(guildId)].filter(Boolean)
    : [...client.guilds.cache.values()];

  if (!targets.length) return 0;

  const rest = new REST({ version: "10" }).setToken(config.token);
  let updated = 0;

  for (const guild of targets) {
    if (await syncGuild(rest, guild, body)) updated += 1;
  }

  return updated;
}
