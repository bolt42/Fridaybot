import crypto from "crypto";

export default function handler(req, res) {
  const { id } = req.query;
  const secret = process.env.TELEGRAM_BOT_TOKEN;

  if (!secret) {
    console.error("❌ TELEGRAM_BOT_TOKEN is not set in environment!");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const sig = crypto
    .createHmac("sha256", secret)
    .update(id.toString())
    .digest("hex");

  res.status(200).json({ sig });   // ✅ return the signature
}
