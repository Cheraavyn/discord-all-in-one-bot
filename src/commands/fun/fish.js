import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  BAITS,
  BAIT_ORDER,
  FISH,
  FISH_RARITIES,
  FISH_RARITY_ORDER,
  RODS,
  ROD_ORDER,
  fishesOfRarity,
} from "../../lib/fishCatalog.js";
import {
  buyFishingItem,
  castLine,
  claimBaitSupply,
  equipBait,
  equipRod,
  getCastCooldownRemaining,
  getFishBag,
  getFishingAccount,
  getFishingLeaderboard,
  getFishingSummary,
  sellFish,
} from "../../lib/fishing.js";
import { formatCoins } from "../../lib/economy.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { discordTimestamp } from "../../lib/duration.js";
import { assertGuildInteraction } from "../../lib/guards.js";

const pct = (value) => `+${Math.round(value * 100)}%`;

export default {
  data: new SlashCommandBuilder()
    .setName("fish")
    .setDescription("Fishing: mancing ikan, kumpulkan spesies langka, dan jual untuk koin")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName("cast").setDescription("Lempar pancing dan dapatkan ikan"))
    .addSubcommand((sub) =>
      sub
        .setName("sell")
        .setDescription("Jual ikan dari tas menjadi koin")
        .addStringOption((option) =>
          option.setName("ikan").setDescription("Nama ikan (kosongkan untuk menjual semua)").setAutocomplete(true),
        )
        .addIntegerOption((option) =>
          option.setName("jumlah").setDescription("Jumlah yang dijual").setMinValue(1).setMaxValue(999),
        ),
    )
    .addSubcommand((sub) => sub.setName("bag").setDescription("Lihat isi tas ikan kamu"))
    .addSubcommand((sub) => sub.setName("shop").setDescription("Lihat harga rod dan bait"))
    .addSubcommand((sub) =>
      sub
        .setName("buy")
        .setDescription("Beli rod atau bait")
        .addStringOption((option) =>
          option
            .setName("jenis")
            .setDescription("Jenis barang")
            .setRequired(true)
            .addChoices({ name: "🎣 Rod (pancing)", value: "rod" }, { name: "🪱 Bait (umpan)", value: "bait" }),
        )
        .addStringOption((option) =>
          option.setName("item").setDescription("Barang yang dibeli").setRequired(true).setAutocomplete(true),
        )
        .addIntegerOption((option) =>
          option.setName("jumlah").setDescription("Jumlah bait (default 1)").setMinValue(1).setMaxValue(100),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("equip")
        .setDescription("Pasang rod yang sudah kamu punya")
        .addStringOption((option) =>
          option
            .setName("rod")
            .setDescription("Rod yang dipakai")
            .setRequired(true)
            .addChoices(...ROD_ORDER.map((id) => ({ name: `${RODS[id].emoji} ${RODS[id].name}`, value: id }))),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("bait")
        .setDescription("Ganti umpan aktif")
        .addStringOption((option) =>
          option
            .setName("jenis")
            .setDescription("Bait yang dipakai")
            .setRequired(true)
            .addChoices(...BAIT_ORDER.map((id) => ({ name: `${BAITS[id].emoji} ${BAITS[id].name}`, value: id }))),
        ),
    )
    .addSubcommand((sub) => sub.setName("guide").setDescription("Daftar semua ikan, rarity, dan harga"))
    .addSubcommand((sub) => sub.setName("stats").setDescription("Statistik memancing kamu"))
    .addSubcommand((sub) => sub.setName("supply").setDescription("Ambil 5 Worm gratis tiap 6 jam"))
    .addSubcommand((sub) => sub.setName("leaderboard").setDescription("Papan peringkat nelayan server ini")),

  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused().toLowerCase();
    let choices = [];

    if (subcommand === "sell") {
      choices = getFishBag(interaction.guildId, interaction.user.id)
        .filter((entry) => entry.fish.name.toLowerCase().includes(focused) || entry.fish.id.includes(focused))
        .map((entry) => ({
          name: `${entry.fish.emoji} ${entry.fish.name} ×${entry.count} — ${formatCoins(entry.value)}`.slice(0, 100),
          value: entry.fish.id,
        }));
    }

    if (subcommand === "buy") {
      const type = interaction.options.getString("jenis") ?? "rod";
      const pool = type === "bait" ? BAIT_ORDER : ROD_ORDER;
      const account = getFishingAccount(interaction.guildId, interaction.user.id);
      choices = pool
        .filter((id) => id.includes(focused) || (type === "bait" ? BAITS[id] : RODS[id]).name.toLowerCase().includes(focused))
        .map((id) => {
          const item = type === "bait" ? BAITS[id] : RODS[id];
          const owned = type === "bait" ? ` stok ${account.baits[id] ?? 0}` : account.rods.includes(id) ? " dimiliki" : "";
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

    if (subcommand === "cast") return cast(interaction, guildId, userId);
    if (subcommand === "sell") return sell(interaction, guildId, userId);
    if (subcommand === "bag") return bag(interaction, guildId, userId);
    if (subcommand === "shop") return shop(interaction);
    if (subcommand === "buy") return buy(interaction, guildId, userId);
    if (subcommand === "equip") return equip(interaction, guildId, userId);
    if (subcommand === "bait") return useBait(interaction, guildId, userId);
    if (subcommand === "guide") return guide(interaction);
    if (subcommand === "stats") return stats(interaction, guildId, userId);
    if (subcommand === "supply") return supply(interaction, guildId, userId);
    return leaderboard(interaction, guildId);
  },
};

/* --------------------------------- Handler ---------------------------------- */

async function cast(interaction, guildId, userId) {
  // Cek cooldown dulu supaya balasan singkat ini tetap bisa dikirim ephemeral.
  const remainingMs = await getCastCooldownRemaining(guildId, userId);
  if (remainingMs > 0) {
    await interaction.reply({
      embeds: [
        buildEmbed({
          title: "🎣 Tunggu sebentar",
          description: `Tali masih terlihat. Lempar lagi ${discordTimestamp(Date.now() + remainingMs)}.`,
          color: COLORS.warning,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // castLine menyimpan seluruh data ke disk; akuisasi dulu supaya proses
  // yang lambat tidak membuat token interaksi kedaluwarsa (10062).
  await interaction.deferReply();

  const result = await castLine(guildId, userId);

  if (!result.ok) {
    await interaction.editReply({
      embeds: [
        buildEmbed({
          title: "🎣 Tunggu sebentar",
          description: `Tali masih terlihat. Lempar lagi ${discordTimestamp(Date.now() + result.remainingMs)}.`,
          color: COLORS.warning,
        }),
      ],
    });
    return;
  }

  await interaction.editReply({ embeds: [castEmbed(result)] });
}

async function sell(interaction, guildId, userId) {
  const fishId = interaction.options.getString("ikan");
  const amount = interaction.options.getInteger("jumlah");
  const result = await sellFish(guildId, userId, { fishId, amount });
  const lines = result.items.map(
    (item) => `${item.fish.emoji} **${item.fish.name}** ×${item.count} → ${formatCoins(item.coins)}`,
  );

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: "💰 Ikan Terjual",
        description: lines.join("\n"),
        color: COLORS.success,
        fields: [
          { name: "Total didapat", value: formatCoins(result.total), inline: true },
          { name: "Sisa ikan di tas", value: `${result.remaining.reduce((sum, entry) => sum + entry.count, 0)} ekor`, inline: true },
          { name: "Saldo sekarang", value: formatCoins(result.balance), inline: true },
        ],
      }),
    ],
  });
}

async function bag(interaction, guildId, userId) {
  const summary = getFishingSummary(guildId, userId);
  const entries = getFishBag(guildId, userId);
  const list = entries.length
    ? entries
        .map(
          ({ fish, count, value, unitValue }) =>
            `${fish.emoji} **${fish.name}** ×${count} — ${formatCoins(value)} (${formatCoins(unitValue)}/ekor)`,
        )
        .join("\n")
    : "Tas masih kosong. Mulai dengan `/fish cast`.";

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: `🎒 Tas Ikan ${interaction.user.username}`,
        description: list,
        color: COLORS.info,
        fields: [
          { name: "Total ikan", value: `**${summary.totalFish}** ekor (${summary.uniqueFish} spesies)`, inline: true },
          { name: "Nilai tas", value: formatCoins(summary.bagValue), inline: true },
          { name: "Paling mahal", value: summary.best ? `${summary.best.fish.emoji} ${summary.best.fish.name} — ${formatCoins(summary.best.value)}` : "-", inline: true },
        ],
        footer: "/fish sell untuk menjual semua · /fish sell ikan:<nama> untuk sebagian",
      }),
    ],
  });
}

async function shop(interaction) {
  const rods = ROD_ORDER.map((id) => {
    const rod = RODS[id];
    return `${rod.emoji} **${rod.name}** — ${formatCoins(rod.cost)} · peluang langka ${pct(rod.luck)} · nilai ${pct(rod.valueBonus)}`;
  }).join("\n");
  const baits = BAIT_ORDER.map((id) => {
    const bait = BAITS[id];
    return `${bait.emoji} **${bait.name}** — ${formatCoins(bait.cost)}/pcs · peluang langka ${pct(bait.luck)} · nilai ${pct(bait.valueBonus)}`;
  }).join("\n");

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: "🏪 Fishing Shop",
        description: "Rod bisa dipakai selamanya. Bait habis setelah 1 kali cast — selalu cek stok sebelum mancing.",
        color: COLORS.music,
        fields: [
          { name: "🎣 Rod (pancing)", value: rods },
          { name: "🪱 Bait (umpan)", value: baits },
        ],
        footer: "Beli: /fish buy jenis:rod atau /fish buy jenis:bait item:<nama> jumlah:<n>",
      }),
    ],
  });
}

async function buy(interaction, guildId, userId) {
  const type = interaction.options.getString("jenis", true);
  const itemId = interaction.options.getString("item", true);
  const amount = interaction.options.getInteger("jumlah") ?? 1;
  const result = await buyFishingItem(guildId, userId, type, itemId, amount);
  const item = result.rod ?? result.bait;

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
          ...(result.kind === "rod"
            ? [{ name: "Status", value: `**${item.name}** langsung terpasang. Gunakan \`/fish equip\` untuk berganti rod.` }]
            : []),
        ],
      }),
    ],
  });
}

async function equip(interaction, guildId, userId) {
  const { rod, bait } = await equipRod(guildId, userId, interaction.options.getString("rod", true));
  await interaction.reply({
    embeds: [
      buildEmbed({
        title: `🎣 ${rod.name} Terpasang`,
        description: `${rod.note}\nPeluang ikan langka **${pct(rod.luck)}** · bonus nilai **${pct(rod.valueBonus)}**.\nBait aktif: ${bait.emoji} **${bait.name}**.`,
        color: COLORS.success,
      }),
    ],
  });
}

async function useBait(interaction, guildId, userId) {
  const { bait, rod } = await equipBait(guildId, userId, interaction.options.getString("jenis", true));
  await interaction.reply({
    embeds: [
      buildEmbed({
        title: `${bait.emoji} ${bait.name} Terpasang`,
        description: `${bait.note}\nTotal peluang ikan langka sekarang **${pct(rod.luck + bait.luck)}**.\nSatu bait dipakai setiap kali \`/fish cast\`.`,
        color: COLORS.success,
      }),
    ],
  });
}

async function guide(interaction) {
  const fields = FISH_RARITY_ORDER.map((rarity) => {
    const meta = FISH_RARITIES[rarity];
    const lines = fishesOfRarity(rarity).map(
      (fish) => `${fish.emoji} **${fish.name}** — ${formatCoins(fish.price)} · ${fish.minCm}–${fish.maxCm} cm`,
    );
    return { name: `${meta.emoji} ${meta.label} — ${meta.weight}%`, value: lines.join("\n") };
  });

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: "📖 Panduan Fishing",
        description: `Ada **${FISH.length}** spesies ikan. Semakin langka, semakin mahal. Ukuran ikan (±30%) dan bonus rod/bait ikut menentukan harga akhir.`,
        color: COLORS.info,
        fields,
        footer: "Rod + bait yang lebih bagus = peluang ikan Rare ke atas lebih besar",
      }),
    ],
  });
}

async function stats(interaction, guildId, userId) {
  const summary = getFishingSummary(guildId, userId);
  const baits = BAIT_ORDER.filter((id) => summary.baits[id])
    .map((id) => `${BAITS[id].emoji} ${BAITS[id].name} ×${summary.baits[id]}`)
    .join("\n") || "_Tidak ada bait tersisa._";

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: `📊 Statistik Nelayan ${interaction.user.username}`,
        color: COLORS.info,
        fields: [
          { name: "Cast", value: `**${summary.casts}** kali`, inline: true },
          { name: "Total ikan", value: `**${summary.totalFish}** ekor`, inline: true },
          { name: "Spesies unik", value: `**${summary.uniqueFish}/${FISH.length}**`, inline: true },
          { name: "Koin dari ikan", value: formatCoins(summary.fishEarned), inline: true },
          { name: "Nilai tas", value: formatCoins(summary.bagValue), inline: true },
          { name: "Rod aktif", value: `${summary.rod.emoji} **${summary.rod.name}** (${summary.ownedRods.length}/${ROD_ORDER.length} dimiliki)`, inline: true },
          {
            name: "Rekor tangkapan",
            value: summary.best
              ? `${summary.best.fish.emoji} **${summary.best.fish.name}** · ${summary.best.sizeCm} cm · ${formatCoins(summary.best.value)}`
              : "Belum ada",
          },
          { name: "Stok bait", value: baits },
        ],
        footer: "Ambil Worm gratis tiap 6 jam lewat /fish supply",
      }),
    ],
  });
}

async function supply(interaction, guildId, userId) {
  const result = await claimBaitSupply(guildId, userId);

  if (!result.claimed) {
    await interaction.reply({
      embeds: [
        buildEmbed({
          title: "🪱 Belum saatnya",
          description: `Kamu bisa ambil bait gratis lagi ${discordTimestamp(Date.now() + result.remainingMs)}.`,
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
        title: "🎁 Bait Gratis",
        description: `Kamu mendapat **${result.amount}x ${result.bait.emoji} ${result.bait.name}**.\nStok sekarang: **${result.stock}**.`,
        color: COLORS.success,
        footer: "Bisa diambil lagi 6 jam sekali · /fish cast untuk memakainya",
      }),
    ],
  });
}

async function leaderboard(interaction, guildId) {
  await interaction.deferReply();

  const board = getFishingLeaderboard(guildId, 10);
  if (!board.length) {
    await interaction.editReply({
      embeds: [
        buildEmbed({
          title: "🏆 Papan Nelayan",
          description: "Belum ada yang menjual ikan di server ini. Jadilah yang pertama!",
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
      `${medals[entry.rank - 1] ?? `**#${entry.rank}**`} **${names.get(entry.userId)}** — ${formatCoins(entry.fishEarned)} · ${entry.casts} cast${entry.bestCatch ? ` · ${entry.bestCatch.emoji} ${entry.bestCatch.name}` : ""}`,
  );

  await interaction.editReply({
    embeds: [
      buildEmbed({
        title: "🏆 Papan Peringkat Nelayan",
        description: lines.join("\n"),
        color: COLORS.warning,
        footer: "Diurutkan dari total koin hasil penjualan ikan",
      }),
    ],
  });
}

/* ---------------------------------- Embed ----------------------------------- */

function castEmbed(result) {
  const { fish, rarityMeta, sizeCm, value, valueBonus, rod, bait, isNewBest, baitLeft } = result;
  const hype =
    fish.rarity === "mythic"
      ? "🌟 **MYTHIC CATCH!** Makhluk dari kedalaman legendaris naik ke permukaan!"
      : fish.rarity === "legendary"
        ? "✨ **LEGENDARY CATCH!** Semua nelayan akan iri!"
        : fish.rarity === "epic"
          ? "💫 **EPIC CATCH!** Spesies yang sangat dicari!"
          : fish.rarity === "rare"
            ? "🔹 **Rare catch!** Lumayan langka."
            : "🎣 **Nice catch!** Masuk tas, bisa dijual nanti.";

  return buildEmbed({
    title: `${rarityMeta.emoji} ${fish.emoji} ${fish.name}!`,
    description: `${hype}\n\n*Ditemukan di ${fish.habitat}.*`,
    color: rarityMeta.color,
    fields: [
      { name: "Rarity", value: `${rarityMeta.emoji} ${rarityMeta.label}`, inline: true },
      { name: "Ukuran", value: `**${sizeCm} cm**`, inline: true },
      { name: "Nilai jual", value: formatCoins(value), inline: true },
      { name: "Rod", value: `${rod.emoji} ${rod.name} (${pct(rod.luck)} langka)`, inline: true },
      { name: "Bait", value: `${bait.emoji} ${bait.name} (${pct(bait.luck)} langka)`, inline: true },
      { name: "Bonus nilai", value: pct(valueBonus), inline: true },
      { name: "Rekor baru", value: isNewBest ? "🏆 **Ya!**" : "Tidak", inline: true },
      { name: "Bait tersisa", value: `**${baitLeft}**${baitLeft <= 2 ? " — segera isi!" : ""}`, inline: true },
    ],
    footer: `Lempar lagi ${discordTimestamp(result.nextCastAt)} · /fish sell untuk menjual · /fish bag untuk melihat tas`,
  });
}
