import { ref, get, set } from "firebase/database";
import { rtdb } from "../firebaseConfig.js"; // adjust path

// ====================== ENV CONFIG ======================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || "https://your-app.vercel.app";
const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((id) => parseInt(id.trim()))
  .filter(Boolean);

// ---- In-memory data (replace with DB for production) ----
const users = new Map();
const rooms = new Map();
const transactions = new Map();
const withdrawalRequests = new Map();

// ====================== UTILS ======================
async function telegram(method, payload) {
  const url = `https://api.telegram.org/bot${TOKEN}/${method}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", { chat_id: chatId, text, ...extra });
}

async function registerUserToFirebase(user) {
  try {
    const userRef = ref(rtdb, "users/" + user.id);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
      const now = new Date().toISOString();
      const newUser = {
        telegramId: user.id.toString(),
        username: user.username || `user_${user.id}`,
        balance: 50,
        gamesPlayed: 0,
        gamesWon: 0,
        totalWinnings: 0,
        language: user.language_code || "en",
        createdAt: now,
        updatedAt: now,
      };
      await set(userRef, newUser);
      console.log("✅ User registered:", newUser);
    } else {
      console.log("🔹 User already exists in RTDB");
    }
  } catch (err) {
    console.error("❌ Error registering user:", err);
  }
}

// ====================== COMMAND HANDLERS ======================
async function handleStart(message) {
  const chatId = message.chat.id;
  const user = message.from;

  await registerUserToFirebase(user);

  const welcomeText = `
🎯 Welcome to Friday Bingo! 🎯

Available commands:
/playgame - Launch the bingo mini app
/deposit - Add funds to your account
/withdraw - Withdraw your winnings

Let's play some bingo! 🎊
  `;
  await sendMessage(chatId, welcomeText);
}

async function handlePlayGame(message) {
  const chatId = message.chat.id;
  const user = message.from;

  await registerUserToFirebase(user);

  if (!users.has(user.id)) {
    users.set(user.id, {
      id: user.id,
      username: user.username || `user_${user.id}`,
      balance: 50,
      createdAt: new Date(),
    });
  }

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🎮 Play Friday Bingo",
          web_app: { url: WEBAPP_URL },
        },
      ],
    ],
  };

  await sendMessage(chatId, "🎯 Ready to play Friday Bingo? Tap the button below!", {
    reply_markup: keyboard,
  });
}

// ====================== USER COMMANDS ======================
bot.onText(/\/deposit/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!users.has(userId)) {
    sendMessage(chatId, "እባክዎ በመጀመሪያ /playgame ይተይቡ።");
    return;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "📱 CBE Mobile Banking", callback_data: "deposit_cbe" }],
      [{ text: "💳 Telebirr", callback_data: "deposit_telebirr" }],
    ],
  };

  sendMessage(chatId, "የክፍያ መንገዱን ይምረጡ:", { reply_markup: keyboard });
});

bot.onText(/\/withdraw/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!users.has(userId)) {
    sendMessage(chatId, "እባክዎ በመጀመሪያ /playgame ይተይቡ።");
    return;
  }

  const user = users.get(userId);
  sendMessage(
    chatId,
    `💰 የአሁን ሂሳብዎ: ${user.balance} ብር\n\nየሚወጣውን መጠን ይላኩ (ምሳሌ: 100):`
  );

  bot.once("message", (amountMsg) => {
    const amount = parseFloat(amountMsg.text);

    if (isNaN(amount) || amount <= 0) {
      sendMessage(chatId, "❌ ትክክለኛ መጠን ያስገቡ።");
      return;
    }

    if (amount > user.balance) {
      sendMessage(chatId, "❌ በቂ ሂሳብ የለዎትም።");
      return;
    }

    sendMessage(
      chatId,
      "የመውጫ አካውንት መረጃ ይላኩ (የባንክ ሂሳብ ወይም የቴሌብር ቁጥር):"
    );

    bot.once("message", (accountMsg) => {
      const account = accountMsg.text;
      const requestId = `${userId}_${Date.now()}`;

      withdrawalRequests.set(requestId, {
        id: requestId,
        userId,
        amount,
        account,
        status: "pending",
        createdAt: new Date(),
      });

      user.balance -= amount;
      users.set(userId, user);

      sendMessage(
        chatId,
        "⏳ የማውጫ ጥያቄዎ ተቀበለ። እባክዎ ይጠብቁ፣ ግብይቱ በማስኬድ ላይ ነው።"
      );

      ADMIN_IDS.forEach((adminId) => {
        if (adminId) {
          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: "✅ ክፍያ ተፈጸመ",
                  callback_data: `complete_withdrawal_${requestId}`,
                },
              ],
            ],
          };

          sendMessage(
            adminId,
            `💰 የማውጫ ጥያቄ:\n\n👤 ተጠቃሚ: @${
              user.username || userId
            }\n💵 መጠን: ${amount} ብር\n🏦 አካውንት: ${account}\n🕐 ጊዜ: ${new Date().toLocaleString()}`,
            { reply_markup: keyboard }
          );
        }
      });
    });
  });
});

// ====================== CALLBACK QUERIES ======================
bot.on("callback_query", (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  if (data === "deposit_cbe") {
    sendMessage(
      chatId,
      '📱 CBE Mobile Banking SMS ደረሰኞን ይላኩ:\n\nምሳሌ: "CBE: Transaction successful. Amount: 100.00 ETB. Ref: TXN123456789. Balance: 500.00 ETB. Time: 15:30 12/01/2024"'
    );

    bot.once("message", async (smsMsg) => {
      const smsText = smsMsg.text;
      const transactionDetails = await parseCBESMS(smsText);

      if (transactionDetails) {
        await processDeposit(userId, transactionDetails, chatId);
      } else {
        sendMessage(chatId, "❌ ትክክለኛ CBE SMS ያስገቡ።");
      }
    });
  } else if (data === "deposit_telebirr") {
    sendMessage(
      chatId,
      '💳 Telebirr SMS ደረሰኞን ወይም የድር አገናኙን ይላኩ:\n\nምሳሌ: "https://telebirr.com/receipt/ABC123" ወይም SMS ደረሰኝ'
    );

    bot.once("message", async (receiptMsg) => {
      const receiptText = receiptMsg.text;
      let transactionDetails;

      if (receiptText.startsWith("http")) {
        transactionDetails = await scrapeTelebirrReceipt(receiptText);
      } else {
        transactionDetails = await parseTelebirrSMS(receiptText);
      }

      if (transactionDetails) {
        await processDeposit(userId, transactionDetails, chatId);
      } else {
        sendMessage(chatId, "❌ ትክክለኛ Telebirr ደረሰኝ ያስገቡ።");
      }
    });
  } else if (data.startsWith("complete_withdrawal_")) {
    const requestId = data.replace("complete_withdrawal_", "");
    const request = withdrawalRequests.get(requestId);

    if (request && request.status === "pending") {
      request.status = "completed";
      withdrawalRequests.set(requestId, request);

      sendMessage(
        request.userId,
        `✅ የማውጫ ጥያቄዎ ተፈጽሟል!\n\n💵 መጠን: ${request.amount} ብር\n🏦 አካውንት: ${request.account}`
      );

      sendMessage(chatId, `✅ የማውጫ ጥያቄ ${requestId} ተፈጽሟል።`);
    }
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

// ====================== ADMIN COMMANDS ======================
bot.onText(/\/admin_create_room/, (msg) => {
  const userId = msg.from.id;
  if (!ADMIN_IDS.includes(userId)) {
    sendMessage(msg.chat.id, "❌ You are not authorized.");
    return;
  }

  sendMessage(
    msg.chat.id,
    "Send room details in format:\nRoomName,BetAmount,MaxPlayers"
  );

  bot.once("message", (roomMsg) => {
    const [name, betAmount, maxPlayers] = roomMsg.text.split(",");

    if (name && betAmount && maxPlayers) {
      const roomId = `room_${Date.now()}`;
      rooms.set(roomId, {
        id: roomId,
        name: name.trim(),
        betAmount: parseFloat(betAmount.trim()),
        maxPlayers: parseInt(maxPlayers.trim()),
        currentPlayers: 0,
        gameStatus: "waiting",
        isDemoRoom: false,
        createdBy: userId,
      });

      sendMessage(msg.chat.id, `✅ Room "${name}" created successfully!`);
    } else {
      sendMessage(msg.chat.id, "❌ Invalid format. Try again.");
    }
  });
});

bot.onText(/\/admin_balance (.+) (.+)/, (msg, match) => {
  const userId = msg.from.id;
  if (!ADMIN_IDS.includes(userId)) {
    sendMessage(msg.chat.id, "❌ You are not authorized.");
    return;
  }

  const username = match[1];
  const amount = parseFloat(match[2]);

  const targetUser = Array.from(users.values()).find(
    (u) => u.username === username
  );

  if (targetUser) {
    targetUser.balance += amount;
    users.set(targetUser.id, targetUser);

    sendMessage(
      msg.chat.id,
      `✅ Balance updated for @${username}:\nNew balance: ${targetUser.balance} ETB`
    );

    sendMessage(
      targetUser.id,
      `💰 Your balance has been updated!\nChange: ${
        amount > 0 ? "+" : ""
      }${amount} ETB\nNew balance: ${targetUser.balance} ETB`
    );
  } else {
    sendMessage(msg.chat.id, `❌ User @${username} not found.`);
  }
});

// ====================== UTILS ======================
async function processDeposit(userId, transactionDetails, chatId) {
  const user = users.get(userId);
  if (!user) {
    sendMessage(chatId, "❌ ተጠቃሚ አልተገኘም።");
    return;
  }

  transactions.set(transactionDetails.transactionId, {
    ...transactionDetails,
    userId,
    status: "completed",
  });

  user.balance += transactionDetails.amount;
  users.set(userId, user);

  sendMessage(
    chatId,
    `✅ ክፍያዎ በተሳካ ሁኔታ ተቀብሏል!\n\n💵 የገባ መጠን: ${
      transactionDetails.amount
    } ብር\n🏦 የክፍያ መንገድ: ${
      transactionDetails.method
    }\n💰 አዲስ ሂሳብ: ${user.balance} ብር\n📱 የግብይት ቁጥር: ${
      transactionDetails.transactionId
    }`
  );
}


// ====================== WEBHOOK HANDLER ======================
export default async function handler(req, res) {
  console.log("🚀 Webhook hit!", req.method);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method === "GET")
    return res.status(200).json({ status: "Bot is running", time: Date.now() });

  if (req.method === "POST") {
    try {
      const update = req.body;
      console.log("📩 Telegram update:", JSON.stringify(update, null, 2));

      // Always ACK immediately so Telegram doesn’t retry
      res.status(200).json({ ok: true });

      if (update.message) {
        const text = update.message.text;
        if (text === "/start") await handleStart(update.message);
        else if (text === "/playgame") await handlePlayGame(update.message);
        else if (text === "/deposit") {
          await sendMessage(update.message.chat.id, "👉 Deposit flow not yet refactored.");
        }
        else if (text === "/withdraw") {
          await sendMessage(update.message.chat.id, "👉 Withdraw flow not yet refactored.");
        }
        else {
          await sendMessage(update.message.chat.id, `You said: ${text}`);
        }
      }

      if (update.callback_query) {
        await sendMessage(update.callback_query.message.chat.id, "Callback received!");
      }
    } catch (err) {
      console.error("❌ Error in handler:", err);
      return res.status(200).json({ ok: true }); // prevent Telegram retries
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
