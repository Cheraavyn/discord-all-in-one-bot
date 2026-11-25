import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { BATTLE_MAX_BET, BATTLE_MIN_BET, RARITIES, getCard } from "../../lib/cardCatalog.js";
import {
  attachChallengeMessage,
  buildChallengeComponents,
  buildChallengeEmbed,
  createChallenge,
  hasActiveChallenge,
} from "../../lib/cardBattle.js";
import { getCardCount, getOwnedCards } from "../../lib/cards.js";
import { formatCoins, getBalance } from "../../lib/economy.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("battle")
    .setDescription("Tantang member lain duel kartu dengan taruhan koin")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("lawan").setDescription("Member yang ditantang").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("kartu")
        .setDescription("Kartu yang kamu pakai")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("taruhan")
        .setDescription(`Koin yang dipertaruhkan (${BATTLE_MIN_BET}–${BATTLE_MAX_BET})`)
        .setRequired(true)
        .setMinValue(BATTLE_MIN_BET)
        .setMaxValue(BATTLE_MAX_BET),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const target = interaction.options.getUser("lawan", true);
    const bet = interaction.options.getInteger("taruhan", true);
    const cardId = interaction.options.getString("kartu", true);
    const card = getCard(cardId);

    if (target.bot) throw new BotError("Kamu tidak bisa menantang bot.");
    if (target.id === interaction.user.id) throw new BotError("Kamu tidak bisa menantang dirimu sendiri.");
    if (!card) throw new BotError("Kartu tidak ditemukan. Pilih dari daftar autocomplete.");

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) throw new BotError("Member tersebut tidak ditemukan di server ini.");

    if (!getCardCount(interaction.guild.id, interaction.user.id, card.id)) {
      throw new BotError(`Kamu tidak memiliki kartu **${card.name}**.`);
    }

    const balance = getBalance(interaction.guild.id, interaction.user.id);
    if (balance < bet) {
      throw new BotError(
        `Saldo kamu tidak cukup. Butuh ${formatCoins(bet)}, saldo kamu ${formatCoins(balance)}.`,
      );
    }

    const targetBalance = getBalance(interaction.guild.id, target.id);
    if (targetBalance < bet) {
      throw new BotError(`${target} tidak punya cukup koin untuk taruhan ${formatCoins(bet)}.`);
    }

    if (hasActiveChallenge(interaction.guild.id, interaction.user.id)) {
      throw new BotError("Kamu masih punya tantangan duel yang aktif. Selesaikan atau tunggu kedaluwarsa.");
    }
    if (hasActiveChallenge(interaction.guild.id, target.id)) {
      throw new BotError(`${target} masih punya tantangan duel yang aktif.`);
    }

    const challenge = createChallenge({
      client: interaction.client,
      guildId: interaction.guild.id,
      challengerId: interaction.user.id,
      defenderId: target.id,
      cardId: card.id,
      bet,
    });

    const message = await interaction.reply({
      content: `${target}`,
      embeds: [buildChallengeEmbed(challenge)],
      components: buildChallengeComponents(challenge),
      allowedMentions: { users: [target.id] },
      fetchReply: true,
    });

    attachChallengeMessage(challenge, message);
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const owned = getOwnedCards(interaction.guildId, interaction.user.id);

    const choices = owned
      .filter(({ card }) => card.name.toLowerCase().includes(focused) || card.id.includes(focused))
      .slice(0, 25)
      .map(({ card, count, level, stats }) => ({
        name: `${card.emoji} ${card.name} · Lv.${level} — ${RARITIES[card.rarity].label} · ATK ${stats.atk}${count > 1 ? ` ×${count}` : ""}`.slice(0, 100),
        value: card.id,
      }));

    await interaction.respond(choices);
  },
};
