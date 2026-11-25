import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  LIGHTS,
  LIGHT_ORDER,
  ORE_RARITIES,
  ORE_RARITY_ORDER,
  ORES,
  PICKAXES,
  PICKAXE_ORDER,
  oresOfRarity,
} from "../../lib/miningCatalog.js";
import {
  buyMiningItem,
  claimLightSupply,
  digMine,
  equipLight,
  equipPickaxe,
  formatWeight,
  getDigCooldownRemaining,
  getMiningAccount,
  getMiningLeaderboard,
  getMiningSummary,
  getOreBag,
  sellOres,
} from "../../lib/mining.js";
import { formatCoins } from "../../lib/economy.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { discordTimestamp } from "../../lib/duration.js";
import { assertGuildInteraction } from "../../lib/guards.js";

const pct = (value) => `+${Math.round(value * 100)}%`;

export default {
  data: new SlashCommandBuilder()
    .setName("mine")
    .setDescription("Mining: gali ore, kumpulkan bijih langka, dan jual untuk koin")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName("dig").setDescription("Turun ke tambang dan gali ore"))
    .addSubcommand((sub) =>
      sub
        .setName("sell")
        .setDescription("Jual ore dari tas menjadi koin")
        .addStringOption((option) =>
          option.setName("ore").setDescription("Nama ore (kosongkan untuk menjual semua)").setAutocomplete(true),
        )
        .addIntegerOption((option) =>
          option.setName("jumlah").setDescription("Jumlah yang dijual").setMinValue(1).setMaxValue(999),
        ),
    )
    .addSubcommand((sub) => sub.setName("bag").setDescription("Lihat isi tas ore kamu"))
    .addSubcommand((sub) => sub.setName("shop").setDescription("Lihat harga pickaxe dan lampu"))
    .addSubcommand((sub) =>
      sub
        .setName("buy")
        .setDescription("Beli pickaxe atau lampu")
        .addStringOption((option) =>
          option
            .setName("jenis")
            .setDescription("Jenis barang")
            .setRequired(true)
            .addChoices(
              { name: "⛏️ Pickaxe (alat gali)", value: "pickaxe" },
              { name: "🔥 Light (lampu)", value: "light" },
            ),
        )
        .addStringOption((option) =>
          option.setName("item").setDescription("Barang yang dibeli").setRequired(true).setAutocomplete(true),
        )
        .addIntegerOption((option) =>
          option.setName("jumlah").setDescription("Jumlah lampu (default 1)").setMinValue(1).setMaxValue(100),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("equip")
        .setDescription("Pasang pickaxe yang sudah kamu punya")
        .addStringOption((option) =>
          option
            .setName("pickaxe")
            .setDescription("Pickaxe yang dipakai")
            .setRequired(true)
            .addChoices(...PICKAXE_ORDER.map((id) => ({ name: `${PICKAXES[id].emoji} ${PICKAXES[id].name}`, value: id }))),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("light")
        .setDescription("Ganti lampu aktif")
        .addStringOption((option) =>
          option
            .setName("jenis")
            .setDescription("Lampu yang dipakai")
            .setRequired(true)
            .addChoices(...LIGHT_ORDER.map((id) => ({ name: `${LIGHTS[id].emoji} ${LIGHTS[id].name}`, value: id }))),
        ),
    )
    .addSubcommand((sub) => sub.setName("guide").setDescription("Daftar semua ore, rarity, dan harga"))
    .addSubcommand((sub) => sub.setName("stats").setDescription("Statistik menambang kamu"))
    .addSubcommand((sub) => sub.setName("supply").setDescription("Ambil 5 Torch gratis tiap 6 jam"))
    .addSubcommand((sub) => sub.setName("leaderboard").setDescription("Papan peringkat penambang server ini")),

  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused().toLowerCase();
    let choices = [];

    if (subcommand === "sell") {
      choices = getOreBag(interaction.guildId, interaction.user.id)
        .filter((entry) => entry.ore.name.toLowerCase().includes(focused) || entry.ore.id.includes(focused))
        .map((entry) => ({
          name: `${entry.ore.emoji} ${entry.ore.name} ×${entry.count} — ${formatCoins(entry.value)}`.slice(0, 100),
          value: entry.ore.id,
        }));
    }

    if (subcommand === "buy") {
      const type = interaction.options.getString("jenis") ?? "pickaxe";
      const pool = type === "light" ? LIGHT_ORDER : PICKAXE_ORDER;
      const account = getMiningAccount(interaction.guildId, interaction.user.id);
      choices = pool
        .filter(
          (id) =>
            id.includes(focused) ||
            (type === "light" ? LIGHTS[id] : PICKAXES[id]).name.toLowerCase().includes(focused),
        )
        .map((id) => {
          const item = type === "light" ? LIGHTS[id] : PICKAXES[id];
          const owned =
            type === "light"
              ? ` stok ${account.lights[id] ?? 0}`
              : account.pickaxes.includes(id)
                ? " dimiliki"
                : "";
          return {
            name: `${item.emoji} ${item.name} — ${formatCoins(item.cost)}${owned}`.slice(0, 100),
            value: id,
          };
        });
    }

    await interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    if (subcommand === "dig") return dig(interaction, guildId, userId);
    if (subcommand === "sell") return sell(interaction, guildId, userId);
    if (subcommand === "bag") return bag(interaction, guildId, userId);
    if (subcommand === "shop") return shop(interaction);
    if (subcommand === "buy") return buy(interaction, guildId, userId);
    if (subcommand === "equip") return equip(interaction, guildId, userId);
    if (subcommand === "light") return useLight(interaction, guildId, userId);
    if (subcommand === "guide") return guide(interaction);
    if (subcommand === "stats") return stats(interaction, guildId, userId);
    if (subcommand === "supply") return supply(interaction, guildId, userId);
    return leaderboard(interaction, guildId);
  },
};

/* --------------------------------- Handler ---------------------------------- */

async function dig(interaction, guildId, userId) {
  // Cek cooldown dulu supaya balasan singkat ini tetap bisa dikirim ephemeral.
  const remainingMs = await getDigCooldownRemaining(guildId, userId);
  if (remainingMs > 0) {
    await interaction.reply({
      embeds: [
        buildEmbed({
          title: "⛏️ Tunggu sebentar",
          description: `Pickaxe masih berdebu. Gali lagi ${discordTimestamp(Date.now() + remainingMs)}.`,
          color: COLORS.warning,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // digMine menyimpan seluruh data ke disk; akuisasi dulu supaya proses yang
  // lambat tidak membuat token interaksi kedaluwarsa (10062).
  await interaction.deferReply();

  const result = await digMine(guildId, userId);

  if (!result.ok) {
    await interaction.editReply({
      embeds: [
        buildEmbed({
          title: "⛏️ Tunggu sebentar",
          description: `Pickaxe masih berdebu. Gali lagi ${discordTimestamp(Date.now() + result.remainingMs)}.`,
          color: COLORS.warning,
        }),
      ],
    });
    return;
  }

  await interaction.editReply({ embeds: [digEmbed(result)] });
}

async function sell(interaction, guildId, userId) {
  const oreId = interaction.options.getString("ore");
  const amount = interaction.options.getInteger("jumlah");
  const result = await sellOres(guildId, userId, { oreId, amount });
  const lines = result.items.map(
    (item) => `${item.ore.emoji} **${item.ore.name}** ×${item.count} → ${formatCoins(item.coins)}`,
  );

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: "💰 Ore Terjual",
        description: lines.join("\n"),
        color: COLORS.success,
        fields: [
          { name: "Total didapat", value: formatCoins(result.total), inline: true },
          {
            name: "Sisa ore di tas",
            value: `${result.remaining.reduce((sum, entry) => sum + entry.count, 0)} ore`,
            inline: true,
          },
          { name: "Saldo sekarang", value: formatCoins(result.balance), inline: true },
        ],
      }),
    ],
  });
}

async function bag(interaction, guildId, userId) {
  const summary = getMiningSummary(guildId, userId);
  const entries = getOreBag(guildId, userId);
  const list = entries.length
    ? entries
        .map(
          ({ ore, count, value, unitValue }) =>
            `${ore.emoji} **${ore.name}** ×${count} — ${formatCoins(value)} (${formatCoins(unitValue)}/ore)`,
        )
        .join("\n")
    : "Tas masih kosong. Mulai dengan `/mine dig`.";

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: `🎒 Tas Ore ${interaction.user.username}`,
        description: list,
        color: COLORS.info,
        fields: [
          { name: "Total ore", value: `**${summary.totalOres}** ore (${summary.uniqueOres} jenis)`, inline: true },
          { name: "Nilai tas", value: formatCoins(summary.bagValue), inline: true },
          {
            name: "Paling mahal",
            value: summary.best
              ? `${summary.best.ore.emoji} ${summary.best.ore.name} — ${formatCoins(summary.best.value)}`
              : "-",
            inline: true,
          },
        ],
        footer: "/mine sell untuk menjual semua · /mine sell ore:<nama> untuk sebagian",
      }),
    ],
  });
}

async function shop(interaction) {
  const pickaxes = PICKAXE_ORDER.map((id) => {
    const pickaxe = PICKAXES[id];
    return `${pickaxe.emoji} **${pickaxe.name}** — ${formatCoins(pickaxe.cost)} · peluang langka ${pct(pickaxe.luck)} · nilai ${pct(pickaxe.valueBonus)} · +${pickaxe.depthBonus} m`;
  }).join("\n");
  const lights = LIGHT_ORDER.map((id) => {
    const light = LIGHTS[id];
    return `${light.emoji} **${light.name}** — ${formatCoins(light.cost)}/pcs · peluang langka ${pct(light.luck)} · nilai ${pct(light.valueBonus)}`;
  }).join("\n");

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: "🏪 Mining Shop",
        description:
          "Pickaxe bisa dipakai selamanya. Lampu habis setelah 1 kali dig — selalu cek stok sebelum menambang.",
        color: COLORS.music,
        fields: [
          { name: "⛏️ Pickaxe (alat gali)", value: pickaxes },
          { name: "🔥 Light (lampu)", value: lights },
        ],
        footer: "Beli: /mine buy jenis:pickaxe atau /mine buy jenis:light item:<nama> jumlah:<n>",
      }),
    ],
  });
}

async function buy(interaction, guildId, userId) {
  const type = interaction.options.getString("jenis", true);
  const itemId = interaction.options.getString("item", true);
  const amount = interaction.options.getInteger("jumlah") ?? 1;
  const result = await buyMiningItem(guildId, userId, type, itemId, amount);
  const item = result.pickaxe ?? result.light;

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: "🛒 Pembelian Berhasil",
        description: `Kamu membeli **${result.amount}x ${item.emoji} ${item.name}** seharga ${formatCoins(result.cost)}.`,
        color: COLORS.success,
        fields: [
          { name: "Efek peluang langka", value: pct(item.luck), inline: true },
          { name: "Bonus nilai jual", value: pct(item.valueBonus), inline: true },
          { name: "Saldo sekarang", value: formatCoins(result.balance), inline: true },
          ...(result.kind === "pickaxe"
            ? [{ name: "Status", value: `**${item.name}** langsung terpasang. Gunakan \`/mine equip\` untuk berganti pickaxe.` }]
            : []),
        ],
      }),
    ],
  });
}

async function equip(interaction, guildId, userId) {
  const { pickaxe, light } = await equipPickaxe(guildId, userId, interaction.options.getString("pickaxe", true));
  await interaction.reply({
    embeds: [
      buildEmbed({
        title: `⛏️ ${pickaxe.name} Terpasang`,
        description: `${pickaxe.note}\nPeluang ore langka **${pct(pickaxe.luck)}** · bonus nilai **${pct(pickaxe.valueBonus)}** · kedalaman **+${pickaxe.depthBonus} m**.\nLampu aktif: ${light.emoji} **${light.name}**.`,
        color: COLORS.success,
      }),
    ],
  });
}

async function useLight(interaction, guildId, userId) {
  const { light, pickaxe } = await equipLight(guildId, userId, interaction.options.getString("jenis", true));
  await interaction.reply({
    embeds: [
      buildEmbed({
        title: `${light.emoji} ${light.name} Terpasang`,
        description: `${light.note}\nTotal peluang ore langka sekarang **${pct(pickaxe.luck + light.luck)}**.\nSatu lampu dipakai setiap kali \`/mine dig\`.`,
        color: COLORS.success,
      }),
    ],
  });
}

async function guide(interaction) {
  const fields = ORE_RARITY_ORDER.map((rarity) => {
    const meta = ORE_RARITIES[rarity];
    const lines = oresOfRarity(rarity).map(
      (ore) =>
        `${ore.emoji} **${ore.name}** — ${formatCoins(ore.price)} · ${ore.minDepth}–${ore.maxDepth} m`,
    );
    return { name: `${meta.emoji} ${meta.label} — ${meta.weight}%`, value: lines.join("\n") };
  });

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: "📖 Panduan Mining",
        description: `Ada **${ORES.length}** jenis ore. Semakin langka, semakin mahal. Berat ore (±30%) dan bonus pickaxe/lampu ikut menentukan harga akhir.`,
        color: COLORS.info,
        fields,
        footer: "Pickaxe + lampu lebih bagus = peluang ore Rare ke atas lebih besar",
      }),
    ],
  });
}

async function stats(interaction, guildId, userId) {
  const summary = getMiningSummary(guildId, userId);
  const lights = LIGHT_ORDER.filter((id) => summary.lights[id])
    .map((id) => `${LIGHTS[id].emoji} ${LIGHTS[id].name} ×${summary.lights[id]}`)
    .join("\n") || "_Tidak ada lampu tersisa._";

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: `📊 Statistik Penambang ${interaction.user.username}`,
        color: COLORS.info,
        fields: [
          { name: "Dig", value: `**${summary.digs}** kali`, inline: true },
          { name: "Total ore", value: `**${summary.totalOres}** ore`, inline: true },
          { name: "Jenis unik", value: `**${summary.uniqueOres}/${ORES.length}**`, inline: true },
          { name: "Koin dari ore", value: formatCoins(summary.oreEarned), inline: true },
          { name: "Nilai tas", value: formatCoins(summary.bagValue), inline: true },
          { name: "Kedalaman rekor", value: `**${summary.deepest} m**`, inline: true },
          {
            name: "Pickaxe aktif",
            value: `${summary.pickaxe.emoji} **${summary.pickaxe.name}** (${summary.ownedPickaxes.length}/${PICKAXE_ORDER.length} dimiliki)`,
            inline: true,
          },
          {
            name: "Temuan terbaik",
            value: summary.best
              ? `${summary.best.ore.emoji} **${summary.best.ore.name}** · ${formatWeight(summary.best.weightGr)} · ${summary.best.depth} m · ${formatCoins(summary.best.value)}`
              : "Belum ada",
          },
          { name: "Stok lampu", value: lights },
        ],
        footer: "Ambil Torch gratis tiap 6 jam lewat /mine supply",
      }),
    ],
  });
}

async function supply(interaction, guildId, userId) {
  const result = await claimLightSupply(guildId, userId);

  if (!result.claimed) {
    await interaction.reply({
      embeds: [
        buildEmbed({
          title: "🔥 Belum saatnya",
          description: `Kamu bisa ambil lampu gratis lagi ${discordTimestamp(Date.now() + result.remainingMs)}.`,
          color: COLORS.warning,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: "🎁 Lampu Gratis",
        description: `Kamu mendapat **${result.amount}x ${result.light.emoji} ${result.light.name}**.\nStok sekarang: **${result.stock}**.`,
        color: COLORS.success,
        footer: "Bisa diambil lagi 6 jam sekali · /mine dig untuk memakainya",
      }),
    ],
  });
}

async function leaderboard(interaction, guildId) {
  await interaction.deferReply();

  const board = getMiningLeaderboard(guildId, 10);
  if (!board.length) {
    await interaction.editReply({
      embeds: [
        buildEmbed({
          title: "🏆 Papan Penambang",
          description: "Belum ada yang menjual ore di server ini. Jadilah yang pertama!",
          color: COLORS.neutral,
        }),
      ],
    });
    return;
  }

  const ids = board.map((entry) => entry.userId);
  const members = await Promise.all(ids.map((id) => interaction.guild.members.fetch(id).catch(() => null)));
  const names = new Map(ids.map((id, index) => [id, members[index]?.displayName ?? `User ${id}`]));
  const medals = ["🥇", "🥈", "🥉"];
  const lines = board.map(
    (entry) =>
      `${medals[entry.rank - 1] ?? `**#${entry.rank}**`} **${names.get(entry.userId)}** — ${formatCoins(entry.oreEarned)} · ${entry.digs} dig · ${entry.deepest} m${entry.bestFind ? ` · ${entry.bestFind.emoji} ${entry.bestFind.name}` : ""}`,
  );

  await interaction.editReply({
    embeds: [
      buildEmbed({
        title: "🏆 Papan Peringkat Penambang",
        description: lines.join("\n"),
        color: COLORS.warning,
        footer: "Diurutkan dari total koin hasil penjualan ore",
      }),
    ],
  });
}

/* ---------------------------------- Embed ----------------------------------- */

function digEmbed(result) {
  const { ore, rarityMeta, weightGr, depth, value, valueBonus, pickaxe, light, isNewBest, lightLeft } = result;
  const hype =
    ore.rarity === "mythic"
      ? "🌟 **MYTHIC FIND!** Ore dari inti dunia muncul ke permukaan!"
      : ore.rarity === "legendary"
        ? "✨ **LEGENDARY FIND!** Semua penambang akan iri!"
        : ore.rarity === "epic"
          ? "💫 **EPIC FIND!** Bijih yang sangat dicari!"
          : ore.rarity === "rare"
            ? "🔹 **Rare find!** Lumayan langka."
            : "⛏️ **Nice find!** Masuk tas, bisa dijual nanti.";

  return buildEmbed({
    title: `${rarityMeta.emoji} ${ore.emoji} ${ore.name}!`,
    description: `${hype}\n\n*Ditemukan di ${ore.layer} pada kedalaman ${depth} m.*`,
    color: rarityMeta.color,
    fields: [
      { name: "Rarity", value: `${rarityMeta.emoji} ${rarityMeta.label}`, inline: true },
      { name: "Berat", value: `**${formatWeight(weightGr)}**`, inline: true },
      { name: "Nilai jual", value: formatCoins(value), inline: true },
      {
        name: "Pickaxe",
        value: `${pickaxe.emoji} ${pickaxe.name} (${pct(pickaxe.luck)} langka)`,
        inline: true,
      },
      { name: "Lampu", value: `${light.emoji} ${light.name} (${pct(light.luck)} langka)`, inline: true },
      { name: "Bonus nilai", value: pct(valueBonus), inline: true },
      { name: "Rekor baru", value: isNewBest ? "🏆 **Ya!**" : "Tidak", inline: true },
      { name: "Lampu tersisa", value: `**${lightLeft}**${lightLeft <= 2 ? " — segera isi!" : ""}`, inline: true },
    ],
    footer: `Gali lagi ${discordTimestamp(result.nextDigAt)} · /mine sell untuk menjual · /mine bag untuk melihat tas`,
  });
}
