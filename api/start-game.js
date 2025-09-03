import { rtdb } from "../bot/firebaseConfig.js";
import { ref, runTransaction, set as fbset } from "firebase/database";
import { v4 as uuidv4 } from "uuid";

function generateNumbers(count = 25) {
  const numbers = [];
  while (numbers.length < count) {
    const num = Math.floor(Math.random() * 75) + 1;
    if (!numbers.includes(num)) numbers.push(num);
  }
  return numbers;
}

export default async function handler(req, res) {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: "Missing roomId" });

  const roomRef = ref(rtdb, `rooms/${roomId}`);
  let gameData = null;

  try {
    await runTransaction(roomRef, (room) => {
      if (!room || room.gameStatus !== "countdown") return room;

      const gameId = uuidv4();
      const drawnNumbers = generateNumbers();
      const drawIntervalMs = 2000;

      room.gameStatus = "playing";
      room.gameId = gameId;
      room.calledNumbers = [];
      room.countdownEndAt = null;
      room.countdownStartedBy = null;

      const betAmount = room.betAmount || 0;
      const playerCount = room.players ? Object.keys(room.players).length : 0;
      const totalPayout = Math.floor(betAmount * playerCount * 0.9);

      gameData = {
        id: gameId,
        roomId,
        drawnNumbers,
        createdAt: Date.now(),
        startedAt: Date.now(),
        drawIntervalMs,
        status: "active",
        totalPayout,
      };

      return room;
    });

    if (!gameData) return res.status(400).json({ error: "Game already started or invalid state" });

    const gameRef = ref(rtdb, `games/${gameData.id}`);
    await fbset(gameRef, gameData);

    res.json({ gameId: gameData.id, drawnNumbers: gameData.drawnNumbers });
  } catch (err) {
    console.error("❌ Error starting game:", err);
    res.status(500).json({ error: "Failed to start game" });
  }
}
