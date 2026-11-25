import { REST, Routes } from "discord.js";
import { config, validateConfig } from "./config.js";
import { loadCommands, toSlashCommandData } from "./handlers/commands.js";

const problems = validateConfig();
if (problems.length) {
  console.error("\nKonfigurasi bot belum lengkap:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nPerbaiki isi file .env lalu jalankan ulang perintahnya.\n");
  process.exit(1);
}

const commands = await loadCommands();
const body = toSlashCommandData(commands);

if (!body.length) {
  console.error("Tidak ada command yang bisa didaftarkan.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(config.token);

async function deployToGuild(guild) {
  await rest.put(Routes.applicationGuildCommands(config.clientId, guild.id), { body });
  console.log(`  - ${guild.name} (${guild.id})`);
}

try {
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log(`\nBerhasil mendaftarkan ${body.length} slash command ke server ${config.guildId}.`);
    console.log("Command langsung tersedia dan bisa dipakai semua member (kadang perlu restart aplikasi Discord).\n");
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`\nBerhasil mendaftarkan ${body.length} slash command secara global.`);

    // Command global butuh waktu propagasi (bisa sampai 1 jam).
    // Salinan khusus server membuat command langsung tersedia untuk semua member.
    try {
      const guilds = await rest.get(Routes.userGuilds(), { query: new URLSearchParams({ limit: "200" }) });
      if (guilds.length) {
        console.log(`Mendaftarkan salinan khusus server agar langsung aktif di ${guilds.length} server:`);
        for (const guild of guilds) {
          try {
            await deployToGuild(guild);
          } catch (error) {
            console.warn(`  - GAGAL ${guild.name} (${guild.id}): ${error.message}`);
          }
        }
        console.log("Salinan server langsung tersedia; versi global untuk server yang belum tercakup.\n");
      } else {
        console.log("Bot belum bergabung ke server mana pun, jadi hanya command global yang didaftarkan.\n");
      }
    } catch (error) {
      console.warn(`Gagal mengambil daftar server: ${error.message}`);
    }
  }
} catch (error) {
  console.error("\nGagal mendaftarkan command:", error.message);
  if (error.status === 401 || error.code === 401) console.error("DISCORD_TOKEN tidak valid.");
  else if (error.code === 50001) console.error("Bot belum diundang ke server tersebut.");
  process.exitCode = 1;
}
