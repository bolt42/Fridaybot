export default async function handler(req, res) {
  res.status(200).json({ 
    message: 'Bot API is working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
}
