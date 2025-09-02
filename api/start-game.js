import { rtdb } from "../bot/firebaseConfig.js";
import { ref, get, set as fbset, runTransaction, update } from "firebase/database";
import { v4 as uuidv4 } from "uuid";

export default async function handler(req, res) {
  try {
    const { roomId } = req.body; // ✅ must be sent in body
    if (!roomId) {
      return res.status(400).json({ error: "Missing roomId" });
    }

    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const gameId = uuidv4();

    await runTransaction(roomRef, (room) => {
      if (!room) return room;
      if (room.gameStatus !== "countdown") return room;

      const activeCards = {};
      for (const [cardId, card] of Object.entries(room.bingoCards || {})) {
        if (card.claimed) {
          activeCards[cardId] = card;
        }
      }

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

      room.gameStatus = "playing";
      room.gameId = gameId;

      return room;
    });

    // ✅ Now start number drawing
    startNumberDraw(roomId, gameId);

    return res.status(200).json({ success: true, gameId });
  } catch (err) {
    console.error("❌ Error starting game:", err);
    return res.status(500).json({ error: err.message });
  }
}

// -------------------
// Number drawing loop
// -------------------
function startNumberDraw(roomId, gameId) {
  const gameRef = ref(rtdb, `games/${gameId}`);
  const roomRef = ref(rtdb, `rooms/${roomId}`);

  const ranges = [
    Array.from({ length: 15 }, (_, i) => i + 1),
    Array.from({ length: 15 }, (_, i) => i + 16),
    Array.from({ length: 15 }, (_, i) => i + 31),
    Array.from({ length: 15 }, (_, i) => i + 46),
    Array.from({ length: 15 }, (_, i) => i + 61),
  ];

  let bucketIndex = 0;
  let drawn = [];

  const interval = setInterval(async () => {
    if (bucketIndex >= ranges.length) {
      clearInterval(interval);

      await update(roomRef, {
        gameStatus: "ended",
        activeGameId: null,
        countdownEndAt: null,
        countdownStartedBy: null,
      });
      await update(gameRef, { status: "ended" });

      return;
    }

    const bucket = ranges[bucketIndex];
    if (bucket.length === 0) {
      bucketIndex++;
      return;
    }

    const idx = Math.floor(Math.random() * bucket.length);
    const num = bucket[idx];
    bucket.splice(idx, 1);

    drawn.push(num);

    await update(gameRef, { drawnNumbers: drawn });
    await update(roomRef, {
      calledNumbers: drawn,
      lastCalledNumber: num,
    });

    const numbersInBucket = drawn.filter((n) => {
      if (bucketIndex === 0) return n <= 15;
      if (bucketIndex === 1) return n >= 16 && n <= 30;
      if (bucketIndex === 2) return n >= 31 && n <= 45;
      if (bucketIndex === 3) return n >= 46 && n <= 60;
      if (bucketIndex === 4) return n >= 61 && n <= 75;
      return false;
    });

    if (numbersInBucket.length >= 5) {
      bucketIndex++;
    }
  }, 4000);
}
