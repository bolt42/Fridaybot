import crypto from "crypto";

export default function handler(req, res) {
  const { userId } = req.query;
  const secret = process.env.TELEGRAM_BOT_TOKEN;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(userId.toString())
    .digest("hex");

  res.json({ sig: signature });
}
