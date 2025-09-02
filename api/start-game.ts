// /pages/api/start-game.js (or .ts if using TS)
import { rtdb } from "../src/firebase/config.js";
import { ref, runTransaction, push, update } from "firebase/database";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { roomId } = req.body;
    if (!roomId) {
      res.status(400).json({ error: "Missing roomId" });
      return;
    }

    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const gamesRef = ref(rtdb, "games");

    let createdGameId = null;

    await runTransaction(roomRef, (room) => {
      if (!room) return room;

      // Already started → skip
      if (room.gameStatus === "playing" && room.gameId) {
        return room;
      }

      // Countdown not finished → skip
      if (room.countdownEndAt && Date.now() < room.countdownEndAt) {
        return room;
      }

      // ✅ Create new game
      const newGameRef = push(gamesRef);
      createdGameId = newGameRef.key;

      const activeCards = Object.values(room.bingoCards || {}).filter(
        (c) => c.claimed
      );
      const totalAmount = activeCards.length * room.betAmount * 0.9;

      room.gameStatus = "playing";
      room.gameId = createdGameId;
      room.countdownEndAt = null;
      room.countdownStartedBy = null;

      // Add game data
      update(ref(rtdb, `games/${createdGameId}`), {
        id: createdGameId,
        roomId,
        bingoCards: activeCards,
        winners: [],
        drawnNumbers: [],
        createdAt: Date.now(),
        status: "playing",
        amount: totalAmount,
      });

      return room;
    });

    res.status(200).json({ success: true, gameId: createdGameId });
  } catch (err) {
    console.error("❌ start-game error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
}
