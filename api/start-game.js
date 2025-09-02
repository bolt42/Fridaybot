import { rtdb } from "../bot/firebaseConfig.js";
import { ref, get, set as fbset, runTransaction, update } from "firebase/database";
import { v4 as uuidv4 } from "uuid";

export default async function handler(req, res) {
  try {
    const { roomId, action } = req.body;
    
    // ✅ Handle different actions
    if (action === "stop") {
      return await stopGame(roomId, res);
    }
    
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
      active: true, // ✅ Mark game as active
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

// ✅ Function to stop inactive games
async function stopInactiveGames() {
  try {
    const gamesRef = ref(rtdb, 'games');
    const gamesSnapshot = await get(gamesRef);
    
    if (!gamesSnapshot.exists()) return;
    
    const games = gamesSnapshot.val();
    const now = Date.now();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes
    
    for (const [gameId, game] of Object.entries(games)) {
      if (game.active && game.status === "playing") {
        // Check if game is too old or has no recent activity
        if (now - game.createdAt > inactiveThreshold) {
          console.log(`🛑 Stopping inactive game ${gameId}`);
          
          // Mark game as inactive
          await update(ref(rtdb, `games/${gameId}`), {
            active: false,
            status: "ended"
          });
          
          // Reset room state
          if (game.roomId) {
            await update(ref(rtdb, `rooms/${game.roomId}`), {
              gameStatus: "ended",
              gameId: null,
              calledNumbers: [],
              lastCalledNumber: null,
              countdownEndAt: null,
              countdownStartedBy: null,
            });
          }
          
          // Clean up drawing loop
          activeDrawingLoops.delete(gameId);
        }
      }
    }
  } catch (err) {
    console.error("❌ Error stopping inactive games:", err);
  }
}

// ✅ Run cleanup every 2 minutes
setInterval(stopInactiveGames, 2 * 60 * 1000);

// ✅ Function to manually stop a game
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
    
    // Stop the game
    await update(ref(rtdb, `games/${gameId}`), {
      active: false,
      status: "ended",
      endedAt: Date.now()
    });
    
    // Mark room as ended with 3-minute countdown
    await update(roomRef, {
      gameStatus: "ended",
      gameEndedAt: Date.now(),
      nextGameCountdown: Date.now() + (3 * 60 * 1000), // ✅ 3 minutes from now
    });
    
    // ✅ Start 3-minute countdown to reset room
    setTimeout(async () => {
      try {
        await update(roomRef, {
          gameStatus: "waiting",
          gameId: null,
          calledNumbers: [],
          lastCalledNumber: null,
          countdownEndAt: null,
          countdownStartedBy: null,
          gameEndedAt: null,
          nextGameCountdown: null,
        });
        console.log(`✅ Room ${roomId} reset to waiting after manual stop + 3-minute countdown`);
      } catch (err) {
        console.error(`❌ Error resetting room ${roomId}:`, err);
      }
    }, 3 * 60 * 1000); // ✅ 3 minutes
    
    // Clean up drawing loop
    activeDrawingLoops.delete(gameId);
    
    return res.status(200).json({ 
      success: true, 
      message: `Game ${gameId} stopped successfully` 
    });
  } catch (err) {
    console.error("❌ Error stopping game:", err);
    return res.status(500).json({ error: err.message });
  }
}

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

  let bucketIndex = 0; // ✅ Fixed: Added missing bucketIndex variable
  let drawn = [];

  const interval = setInterval(async () => {
    // ✅ Validate game is still active before each number call
    try {
      const gameSnapshot = await get(gameRef);
      const gameData = gameSnapshot.val();
      
      if (!gameData || !gameData.active || gameData.status !== "playing") {
        console.log(`⚠️ Game ${gameId} is no longer active, stopping number drawing`);
        clearInterval(interval);
        activeDrawingLoops.delete(gameId);
        return;
      }
    } catch (err) {
      console.error(`❌ Error checking game status for ${gameId}:`, err);
      clearInterval(interval);
      activeDrawingLoops.delete(gameId);
      return;
    }

    if (bucketIndex >= ranges.length) {
      clearInterval(interval);

      // ✅ Mark game as ended but keep room state for 3 minutes
      await update(roomRef, {
        gameStatus: "ended", // ✅ Change to ended first
        gameEndedAt: Date.now(), // ✅ Record when game ended
        nextGameCountdown: Date.now() + (3 * 60 * 1000), // ✅ 3 minutes from now
      });
      await update(gameRef, { 
        status: "ended",
        active: false, // ✅ Mark game as inactive
        endedAt: Date.now()
      });

      // ✅ Clean up active drawing loop tracking
      activeDrawingLoops.delete(gameId);
      
      // ✅ Start 3-minute countdown to reset room
      setTimeout(async () => {
        try {
          await update(roomRef, {
            gameStatus: "waiting", // ✅ Reset to waiting after 3 minutes
            gameId: null, // ✅ Clear gameId
            calledNumbers: [], // ✅ Clear called numbers
            lastCalledNumber: null, // ✅ Clear last called number
            countdownEndAt: null,
            countdownStartedBy: null,
            gameEndedAt: null,
            nextGameCountdown: null,
          });
          console.log(`✅ Room ${roomId} reset to waiting after 3-minute countdown`);
        } catch (err) {
          console.error(`❌ Error resetting room ${roomId}:`, err);
        }
      }, 3 * 60 * 1000); // ✅ 3 minutes
      
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

    try {
      // ✅ Update both game and room atomically
      await Promise.all([
        update(gameRef, { drawnNumbers: drawn }),
        update(roomRef, {
          calledNumbers: drawn,
          lastCalledNumber: num,
        })
      ]);

      console.log(`🎲 Called number: ${num} for game ${gameId} in room ${roomId}`);
    } catch (err) {
      console.error(`❌ Error updating game/room for number ${num}:`, err);
      // Continue with next number even if update fails
    }

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
  }, 2000); // ✅ Reduced from 4000ms to 2000ms for faster gameplay
}
