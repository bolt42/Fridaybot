import crypto from "crypto";

export default function handler(req, res) {
  const { id, sig } = req.query;
  const secret = process.env.TELEGRAM_BOT_TOKEN;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(id.toString())
    .digest("hex");

  res.status(200).json({ valid: sig === expectedSig });
}
