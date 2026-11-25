import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Collection } from "discord.js";
import { logger } from "../lib/logger.js";

const COMMANDS_DIR = fileURLToPath(new URL("../commands/", import.meta.url));

async function findCommandFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await findCommandFiles(fullPath)));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
  }

  return files;
}

/** Memuat semua command dari src/commands/<kategori>/<nama>.js */
export async function loadCommands() {
  const commands = new Collection();

  for (const file of await findCommandFiles(COMMANDS_DIR)) {
    try {
      const module = await import(pathToFileURL(file).href);
      const command = module.default;

      if (!command?.data || typeof command.execute !== "function") {
        logger.warn(`Lewati ${path.relative(COMMANDS_DIR, file)}: tidak mengekspor { data, execute }.`);
        continue;
      }

      if (commands.has(command.data.name)) {
        logger.warn(`Command duplikat "${command.data.name}" di ${path.relative(COMMANDS_DIR, file)}, dilewati.`);
        continue;
      }

      const relativePath = path.relative(COMMANDS_DIR, file);
      command.category = relativePath.split(path.sep)[0];
      command.filePath = relativePath;
      commands.set(command.data.name, command);
    } catch (error) {
      logger.error(`Gagal memuat command ${path.relative(COMMANDS_DIR, file)}:`, error);
    }
  }

  logger.info(`${commands.size} command dimuat.`);
  return commands;
}

export function toSlashCommandData(commands) {
  return [...commands.values()].map((command) => command.data.toJSON());
}
