import { NextApiRequest, NextApiResponse } from "next";
import { rtdb } from "../../firebase/config";
import { ref, push, update, runTransaction } from "firebase/database";

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

    let newGameId: string | null = null;

    await runTransaction(roomRef, (room: any) => {
      if (!room) return room;

      // 🚫 Game already running
      if (room.gameStatus === "playing" && room.gameId) {
        return room;
      }

      // 🚫 Countdown not finished
      if (room.countdownEndAt && Date.now() < room.countdownEndAt) {
        return room;
      }

      // ✅ Create new game
      const newGameRef = push(gamesRef);
      newGameId = newGameRef.key!;

      const activeCards = Object.values(room.bingoCards || {}).filter(
        (c: any) => c.claimed
      );

      const totalAmount = activeCards.length * room.betAmount * 0.9;

      room.gameStatus = "playing";
      room.gameId = newGameId;
      room.countdownEndAt = null;
      room.countdownStartedBy = null;

      update(ref(rtdb, `games/${newGameId}`), {
        id: newGameId,
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

    return res.status(200).json({ success: true, gameId: newGameId });
  } catch (err: any) {
    console.error("❌ Error creating game:", err);
    return res.status(500).json({ error: "Failed to create game" });
  }
}
