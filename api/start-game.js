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
    const gameId = uuidv4();
    const drawnNumbers = generateNumbers();

    // Ensure only one game gets created
    await runTransaction(roomRef, (room) => {
      if (!room) return room;

      if (room.gameStatus !== "countdown" || !room.countdownEndAt) {
        // ❌ Either already started or not in countdown anymore
        return room;
      }

      // ✅ Create game entity
      room.gameStatus = "playing";
      room.gameId = gameId;
      room.calledNumbers = [];
      room.countdownEndAt = null;
      room.countdownStartedBy = null;

      return room;
    });

    // Save the actual game data separately
    const gameRef = ref(rtdb, `games/${gameId}`);
    await fbset(gameRef, {
      id: gameId,
      roomId,
      drawnNumbers,
      createdAt: Date.now(),
      status: "active",
    });

    return res.json({ gameId, drawnNumbers });
  } catch (err) {
    console.error("❌ Error starting game:", err);
    return res.status(500).json({ error: "Failed to start game" });
  }
}
