import bot from '../bot/index.js';

export default async function handler(req, res) {
  // Handle webhook requests
  if (req.method === 'POST') {
    try {
      // Process the webhook update
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
