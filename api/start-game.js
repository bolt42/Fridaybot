import { rtdb } from "../bot/firebaseConfig.js";
import { ref, runTransaction, set as fbset } from "firebase/database";
import { v4 as uuidv4 } from "uuid";
function generateNumbers(count = 25) {
  const numbers = [];
  while (numbers.length < count) {
    const num = Math.floor(Math.random() * 75) + 1; // 1–75
    if (!numbers.includes(num)) numbers.push(num);
  }
  return numbers;
}

export default async function handler(req, res) {
  const { roomId } = req.body;
  if (!roomId) {
    return res.status(400).json({ error: "Missing roomId" });
  }

  const roomRef = ref(rtdb, `rooms/${roomId}`);

  try {
    let gameData = null;

    await runTransaction(roomRef, (room) => {
      if (!room) return room;

      if (room.gameStatus !== "countdown" || !room.countdownEndAt) {
        // ❌ Either already started or not in countdown anymore
        return room;
      }

      // ✅ Create game entity inside transaction
      const gameId = uuidv4();
      const drawnNumbers = generateNumbers();

      room.gameStatus = "playing";
      room.gameId = gameId;
      room.calledNumbers = [];
      room.countdownEndAt = null;
      room.countdownStartedBy = null;

      // Save game data here so we can use after commit
      gameData = {
        id: gameId,
        roomId,
        drawnNumbers,
        createdAt: Date.now(),
        status: "active",
      };

      // Return updated room
      return room;
    });

    if (!gameData) {
      return res.status(400).json({ error: "Game already started or invalid state" });
    }

    // ✅ Save game data AFTER transaction (but generated *inside* transaction)
    const gameRef = ref(rtdb, `games/${gameData.id}`);
    await fbset(gameRef, gameData);

    return res.json({ gameId: gameData.id, drawnNumbers: gameData.drawnNumbers });
  } catch (err) {
    console.error("❌ Error starting game:", err);
    return res.status(500).json({ error: "Failed to start game" });
  }
}