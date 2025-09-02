  // adjust path if needed
import { ref, push, set as fbset, runTransaction } from "firebase/database";
import { rtdb } from "../bot/firebaseConfig.js"; 
// ✅ Always default export the handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { roomId } = req.body;
    if (!roomId) {
      return res.status(400).json({ error: "Missing roomId" });
    }

    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const gamesRef = ref(rtdb, "games");

    await runTransaction(roomRef, (room) => {
      if (!room) return room;

      if (room.gameStatus === "playing" && room.gameId) return room;

      if (room.countdownEndAt && Date.now() < room.countdownEndAt) return room;

      const newGameRef = push(gamesRef);
      const gameId = newGameRef.key;

      const activeCards = Object.values(room.bingoCards || {}).filter(
        (c) => c.claimed
      );

      const totalAmount = activeCards.length * room.betAmount * 0.9;

      room.gameStatus = "playing";
      room.gameId = gameId;
      room.countdownEndAt = null;
      room.countdownStartedBy = null;

      fbset(ref(rtdb, `games/${gameId}`), {
        id: gameId,
        roomId: currentRoom.id,
        bingoCards: activeCards,
        winners: [],
        drawnNumbers: [],
        createdAt: Date.now(),
        status: "playing",
        amount: totalAmount,
      });

      return room;
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Error in start-game API:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
