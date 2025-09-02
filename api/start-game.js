import { rtdb } from "../bot/firebaseConfig.js";
import { ref, get, set as fbset, runTransaction, update } from "firebase/database";
import { v4 as uuidv4 } from "uuid";

export default async function handler(req, res) {
  try {
    const { roomId, action } = req.body;

    if (!roomId) {
      return res.status(400).json({ error: "Missing roomId" });
    }

    // ✅ Stop game handler
    if (action === "stop") {
      return await stopGame(roomId, res);
    }

    // ✅ Check if there’s already an active game for this room
    const existingGamesSnap = await get(ref(rtdb, `games`));
    let existingGameId = null;

    if (existingGamesSnap.exists()) {
      existingGamesSnap.forEach((child) => {
        const g = child.val();
        if (g.roomId === roomId && g.active) {
          existingGameId = child.key;
        }
      });
    }

    if (existingGameId) {
      console.log(`⚠️ Room ${roomId} already has active game ${existingGameId}, not creating a new one`);
      return res.status(200).json({ message: "Game already active", gameId: existingGameId });
    }

    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const gameId = uuidv4();

    let activeCards = {};

    // ✅ Reserve gameId safely in room
    const result = await runTransaction(roomRef, (room) => {
      if (!room) return room;

      if (room.gameStatus !== "countdown" || room.gameId) {
        return; // Abort if already playing or countdown passed
      }

      activeCards = {};
      for (const [cardId, card] of Object.entries(room.bingoCards || {})) {
        if (card.claimed) {
          activeCards[cardId] = card;
        }
      }

      room.gameStatus = "playing";
      room.gameId = gameId;
      return room;
    });

    if (!result.committed) {
      const roomSnapshot = await get(roomRef);
      const roomData = roomSnapshot.val();

      if (roomData?.gameId && roomData?.gameStatus === "playing") {
        return res.status(200).json({
          success: true,
          gameId: roomData.gameId,
          message: "Game already started by another client",
        });
      }

      return res.status(400).json({ error: "Transaction aborted (maybe already playing)" });
    }

    // ✅ Create the game in DB
    await fbset(ref(rtdb, `games/${gameId}`), {
      id: gameId,
      roomId,
      bingoCards: activeCards,
      winners: [],
      drawnNumbers: [],
      createdAt: Date.now(),
      status: "playing",
      active: true,
      amount: result.snapshot.val().totalAmount || 0,
    });

    // ✅ Start number drawing loop for this room’s game
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
const activeDrawingLoops = new Set();

function startNumberDraw(roomId, gameId) {
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
    try {
      const gameSnapshot = await get(gameRef);
      const gameData = gameSnapshot.val();

      // ✅ Ensure only this game updates
      if (!gameData || !gameData.active || gameData.status !== "playing") {
        console.log(`⚠️ Game ${gameId} stopped, ending loop`);
        clearInterval(interval);
        activeDrawingLoops.delete(gameId);
        return;
      }

      if (bucketIndex >= ranges.length) {
        clearInterval(interval);

        await update(roomRef, {
          gameStatus: "waiting",
          gameId: null,
          calledNumbers: [],
          lastCalledNumber: null,
          countdownEndAt: null,
          countdownStartedBy: null,
        });

        await update(gameRef, { status: "ended", active: false });

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

      // ✅ Update only this room + its game
      await Promise.all([
        update(gameRef, { drawnNumbers: drawn, lastDrawn: num }),
        update(roomRef, { calledNumbers: drawn, lastCalledNumber: num }),
      ]);

      console.log(`🎲 Called number ${num} for room ${roomId}, game ${gameId}`);

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
        console.log(`📦 Moving to next bucket (${bucketIndex}) for game ${gameId}`);
      }
    } catch (err) {
      console.error(`❌ Error in drawing loop for ${gameId}:`, err);
      clearInterval(interval);
      activeDrawingLoops.delete(gameId);
    }
  }, 2000);
}

// -------------------
// Stop Game Function
// -------------------
async function stopGame(roomId, res) {
  try {
    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const roomSnapshot = await get(roomRef);

    if (!roomSnapshot.exists()) {
      return res.status(404).json({ error: "Room not found" });
    }

    const roomData = roomSnapshot.val();
    const gameId = roomData.gameId;

    if (!gameId) {
      return res.status(400).json({ error: "No active game in this room" });
    }

    await update(ref(rtdb, `games/${gameId}`), { active: false, status: "ended" });
    await update(roomRef, {
      gameStatus: "waiting",
      gameId: null,
      calledNumbers: [],
      lastCalledNumber: null,
      countdownEndAt: null,
      countdownStartedBy: null,
    });

    activeDrawingLoops.delete(gameId);

    return res.status(200).json({ success: true, message: `Game ${gameId} stopped` });
  } catch (err) {
    console.error("❌ Error stopping game:", err);
    return res.status(500).json({ error: err.message });
  }
}
