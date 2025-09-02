// /pages/api/start-game.ts
import { NextApiRequest, NextApiResponse } from "next";
import { rtdb } from "../src/firebase/config";
import { ref, runTransaction, push, update } from "firebase/database";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { roomId } = req.body;
    if (!roomId) {
      return res.status(400).json({ error: "Missing roomId" });
    }

    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const gamesRef = ref(rtdb, "games");

    let createdGameId: string | null = null;

    // 🔒 Transaction prevents multiple creations
    await runTransaction(roomRef, (room: any) => {
      if (!room) return room;

      // Already playing → abort
      if (room.gameStatus === "playing" && room.gameId) {
        return room;
      }

      // Countdown not finished → abort
      if (room.countdownEndAt && Date.now() < room.countdownEndAt) {
        return room;
      }

      // ✅ Create new game
      const newGameRef = push(gamesRef);
      createdGameId = newGameRef.key!;

      const activeCards = Object.values(room.bingoCards || {}).filter(
        (c: any) => c.claimed
      );
      const totalAmount = activeCards.length * room.betAmount * 0.9;

      room.gameStatus = "playing";
      room.gameId = createdGameId;
      room.countdownEndAt = null;
      room.countdownStartedBy = null;

      // Create game entry outside transaction (safe async)
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

    return res.status(200).json({ success: true, gameId: createdGameId });
  } catch (err: any) {
    console.error("❌ start-game error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
