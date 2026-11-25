import { EmbedBuilder } from "discord.js";
import { config } from "../config.js";

export const COLORS = {
  info: config.embedColor,
  success: 0x2ecc71,
  warning: 0xf1c40f,
  error: 0xe74c3c,
  music: 0x9b59b6,
  neutral: 0x95a5a6,
};

export function buildEmbed({ title, description, color = COLORS.info, fields, thumbnail, image, footer, author, timestamp = true } = {}) {
  const embed = new EmbedBuilder().setColor(color);

  if (title) embed.setTitle(title.slice(0, 256));
  if (description) embed.setDescription(description.slice(0, 4096));
  if (fields?.length) embed.addFields(fields);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (author) embed.setAuthor(author);
  if (footer) embed.setFooter({ text: footer });
  if (timestamp) embed.setTimestamp();

  return embed;
}

export const ok = (description, title = "Berhasil") =>
  buildEmbed({ title, description, color: COLORS.success });

export const fail = (description, title = "Gagal") =>
  buildEmbed({ title, description, color: COLORS.error });

export const warn = (description, title = "Perhatian") =>
  buildEmbed({ title, description, color: COLORS.warning });

export const info = (description, title) =>
  buildEmbed({ title, description, color: COLORS.info });

export const music = (description, title) =>
  buildEmbed({ title, description, color: COLORS.music });
