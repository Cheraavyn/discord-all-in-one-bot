/** Error yang aman ditampilkan ke pengguna apa adanya. */
export class BotError extends Error {
  constructor(message, { ephemeral = true } = {}) {
    super(message);
    this.name = "BotError";
    this.ephemeral = ephemeral;
  }
}

export const userError = (message) => new BotError(message);
