import { rtdb } from "../bot/firebaseConfig.js";
import { ref, get, set as fbset, runTransaction, update } from "firebase/database";
import { v4 as uuidv4 } from "uuid";

// active intervals in-memory
const activeDrawingLoops = new Set();

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
    let existingGameId: string | null = null;

    if (existingGamesSnap.exists()) {
      existingGamesSnap.forEach((child) => {
        const g = child.val();
        if (g.roomId === roomId && g.active) {
          existingGameId = child.key;
        }
      });
    }

    if (existingGameId) {
      console.log(`⚠️ Room ${roomId} already has active game ${existingGameId}`);
      return res.status(200).json({ message: "Game already active", gameId: existingGameId });
    }

    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const gameId = uuidv4();
    let activeCards: Record<string, any> = {};

    // ✅ Reserve gameId safely in room
    const result = await runTransaction(roomRef, (room: any) => {
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

    // ✅ Create numbers upfront (exactly 25 numbers)
    const drawOrder = generateBingoDraw();

    // ✅ Create the game in DB
    await fbset(ref(rtdb, `games/${gameId}`), {
      id: gameId,
      roomId,
      bingoCards: activeCards,
      winners: [],
      drawnNumbers: drawOrder,
      createdAt: Date.now(),
      status: "playing",
      active: true,
      amount: result.snapshot.val().totalAmount || 0,
    });

    // ✅ Mark all other games inactive
    if (existingGamesSnap.exists()) {
      existingGamesSnap.forEach(async (child) => {
        const g = child.val();
        if (g.roomId === roomId && child.key !== gameId) {
          await update(ref(rtdb, `games/${child.key}`), { active: false, status: "ended" });
        }
      });
    }

    // ✅ Start number drawing loop
    startNumberDraw(roomId, gameId, drawOrder);

    return res.status(200).json({ success: true, gameId });
  } catch (err: any) {
    console.error("❌ Error starting game:", err);
    return res.status(500).json({ error: err.message });
  }
}

// -------------------
// Number drawing
// -------------------
function generateBingoDraw(): number[] {
  const ranges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];
  let numbers: number[] = [];

  ranges.forEach(([min, max]) => {
    const bucket = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    for (let i = 0; i < 5; i++) {
      const idx = Math.floor(Math.random() * bucket.length);
      numbers.push(bucket.splice(idx, 1)[0]);
    }
  });

  return numbers;
}

function startNumberDraw(roomId: string, gameId: string, drawOrder: number[]) {
  if (activeDrawingLoops.has(gameId)) {
    console.log(`⚠️ Drawing loop already active for game ${gameId}`);
    return;
  }

  activeDrawingLoops.add(gameId);

  const gameRef = ref(rtdb, `games/${gameId}`);
  const roomRef = ref(rtdb, `rooms/${roomId}`);

  let index = 0;
  const interval = setInterval(async () => {
    try {
      const gameSnapshot = await get(gameRef);
      const gameData = gameSnapshot.val();

      if (!gameData || !gameData.active || gameData.status !== "playing") {
        console.log(`⚠️ Game ${gameId} stopped, ending loop`);
        clearInterval(interval);
        activeDrawingLoops.delete(gameId);
        return;
      }

      if (index >= drawOrder.length) {
        // ✅ End game
        await update(roomRef, {
          gameStatus: "ended",
          gameId: null,
          calledNumbers: [],
          lastCalledNumber: null,
          countdownEndAt: null,
          countdownStartedBy: null,
        });

        await update(gameRef, { status: "ended", active: false, endedAt: Date.now() });

        clearInterval(interval);
        activeDrawingLoops.delete(gameId);
        return;
      }

      const num = drawOrder[index];
      index++;

      await Promise.all([
        update(gameRef, { lastDrawn: num }),
        update(roomRef, { calledNumbers: drawOrder.slice(0, index), lastCalledNumber: num }),
      ]);

      console.log(`🎲 Called number ${num} for room ${roomId}, game ${gameId}`);
    } catch (err) {
      console.error(`❌ Error in drawing loop for ${gameId}:`, err);
      clearInterval(interval);
      activeDrawingLoops.delete(gameId);
    }
  }, 1000); // 1s gap
}

// -------------------
// Stop Game Function
// -------------------
async function stopGame(roomId: string, res: any) {
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
  } catch (err: any) {
    console.error("❌ Error stopping game:", err);
    return res.status(500).json({ error: err.message });
  }
}
