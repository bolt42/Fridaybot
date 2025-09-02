import { rtdb } from "../bot/firebaseConfig.js";
import { ref, get, set as fbset, runTransaction, update } from "firebase/database";
import { v4 as uuidv4 } from "uuid";

export default async function handler(req, res) {
  try {
    const { roomId } = req.body;
    if (!roomId) {
      return res.status(400).json({ error: "Missing roomId" });
    }

    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const gameId = uuidv4();

    // Step 1: reserve game inside the room (transaction-safe)
    let activeCards = {};
    const result = await runTransaction(roomRef, (room) => {
      if (!room) return room;
      // ✅ Prevent multiple games: check if already playing OR already has a gameId
      if (room.gameStatus !== "countdown" || room.gameId) {
        return; // Abort transaction - game already started or in progress
      }

      activeCards = {};
      for (const [cardId, card] of Object.entries(room.bingoCards || {})) {
        if (card.claimed) {
          activeCards[cardId] = card;
        }
      }

      // ✅ only modify the room object
      room.gameStatus = "playing";
      room.gameId = gameId;
      return room;
    });

    if (!result.committed) {
      // ✅ Check if game was already started by another client
      const roomSnapshot = await get(roomRef);
      const roomData = roomSnapshot.val();
      
      if (roomData?.gameId && roomData?.gameStatus === "playing") {
        return res.status(200).json({ 
          success: true, 
          gameId: roomData.gameId,
          message: "Game already started by another client" 
        });
      }
      
      return res.status(400).json({ error: "Transaction aborted (maybe already playing)" });
    }

    // Step 2: create the game outside the transaction
    await fbset(ref(rtdb, `games/${gameId}`), {
      id: gameId,
      roomId,
      bingoCards: activeCards,
      winners: [],
      drawnNumbers: [],
      createdAt: Date.now(),
      status: "playing",
      amount: result.snapshot.val().totalAmount || 0,
    });

    // Step 3: start drawing numbers
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
// ✅ Track active drawing loops to prevent duplicates
const activeDrawingLoops = new Set();

function startNumberDraw(roomId, gameId) {
  // ✅ Prevent multiple drawing loops for the same game
  if (activeDrawingLoops.has(gameId)) {
    console.log(`⚠️ Drawing loop already active for game ${gameId}`);
    return;
  }
  
  activeDrawingLoops.add(gameId);
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
        gameStatus: "waiting", // ✅ Reset to waiting for next game
        gameId: null, // ✅ Clear gameId
        calledNumbers: [], // ✅ Clear called numbers
        lastCalledNumber: null, // ✅ Clear last called number
        countdownEndAt: null,
        countdownStartedBy: null,
      });
      await update(gameRef, { status: "ended" });

      // ✅ Clean up active drawing loop tracking
      activeDrawingLoops.delete(gameId);
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
