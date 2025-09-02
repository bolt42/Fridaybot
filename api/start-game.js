import { rtdb } from "../bot/firebaseConfig.js";
import { ref, get, set as fbset, runTransaction } from "firebase/database";
import { v4 as uuidv4 } from "uuid";

export default async function handler(req, res) {
  try {
    const { roomId } = req.body; // ✅ client must send roomId
    if (!roomId) {
      return res.status(400).json({ error: "Missing roomId" });
    }

    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const gameId = uuidv4();

    await runTransaction(roomRef, (room) => {
      if (!room) return room;
      if (room.gameStatus !== "countdown") return room;

      // collect cards that are claimed
      const activeCards = {};
      for (const [cardId, card] of Object.entries(room.bingoCards || {})) {
        if (card.claimed) {
          activeCards[cardId] = card;
        }
      }

      // ✅ store game using the roomId from request
      fbset(ref(rtdb, `games/${gameId}`), {
        id: gameId,
        roomId,
        bingoCards: activeCards,
        winners: [],
        drawnNumbers: [],
        createdAt: Date.now(),
        status: "playing",
        amount: room.totalAmount || 0,
      });

      // update room status
      room.gameStatus = "playing";
      room.activeGameId = gameId;

      return room;
    });

    return res.status(200).json({ success: true, gameId });
  } catch (err) {
    console.error("❌ Error starting game:", err);
    return res.status(500).json({ error: err.message });
  }
}
