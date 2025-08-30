import crypto from "crypto";

export default async function handler(req, res) {
  const { id, sig } = req.query;
  const secret = process.env.TELEGRAM_BOT_TOKEN;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(id.toString())
    .digest("hex");

  if (sig === expectedSig) {
    res.json({ valid: true });
  } else {
    res.json({ valid: false });
  }
}
