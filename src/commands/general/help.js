import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";

const CATEGORY_LABELS = {
  general: "Umum",
  community: "Komunitas",
  economy: "Ekonomi",
  fun: "Hiburan",
  cards: "Kartu",
  moderation: "Moderasi",
  settings: "Pengaturan Server",
  ticket: "Tiket / Support",
  music: "Musik",
};

const CATEGORY_ORDER = ["general", "community", "economy", "fun", "cards", "moderation", "settings", "ticket", "music"];

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Lihat daftar command yang tersedia")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option.setName("command").setDescription("Lihat detail salah satu command").setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = [...interaction.client.commands.values()]
      .filter((command) => command.data.name.includes(focused))
      .slice(0, 25)
      .map((command) => ({ name: `/${command.data.name}`, value: command.data.name }));

    await interaction.respond(choices);
  },

  async execute(interaction) {
    const name = interaction.options.getString("command");

    if (name) {
      const command = interaction.client.commands.get(name);
      if (!command) {
        await interaction.reply({
          embeds: [buildEmbed({ title: "Tidak ditemukan", description: `Command \`/${name}\` tidak ada.`, color: COLORS.error })],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const json = command.data.toJSON();
      const options = (json.options ?? [])
        .map((option) => `\`${option.name}\`${option.required ? "*" : ""} — ${option.description}`)
        .join("\n");

      const embed = buildEmbed({
        title: `/${json.name}`,
        description: json.description,
        color: COLORS.info,
        fields: [
          { name: "Kategori", value: CATEGORY_LABELS[command.category] ?? command.category, inline: true },
          ...(options ? [{ name: "Opsi (* wajib)", value: options }] : []),
        ],
      });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const grouped = new Map();
    for (const command of interaction.client.commands.values()) {
      if (!grouped.has(command.category)) grouped.set(command.category, []);
      grouped.get(command.category).push(command);
    }

    const fields = [...grouped.keys()]
      .sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b))
      .map((category) => ({
        name: CATEGORY_LABELS[category] ?? category,
        value: grouped.get(category)
          .sort((a, b) => a.data.name.localeCompare(b.data.name))
          .map((command) => `\`/${command.data.name}\` — ${command.data.description}`)
          .join("\n")
          .slice(0, 1024),
      }));

    const embed = buildEmbed({
      title: "Daftar Command",
      description: `Total **${interaction.client.commands.size}** command. Gunakan \`/help command:<nama>\` untuk detail.`,
      color: COLORS.info,
      fields,
      footer: interaction.client.user.username,
      thumbnail: interaction.client.user.displayAvatarURL(),
    });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
