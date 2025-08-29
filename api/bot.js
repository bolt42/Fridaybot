import TelegramBot from "node-telegram-bot-api";
import { ref, get, set } from "firebase/database";
import { rtdb } from "../../firebaseConfig.js"; // ✅ adjust relative path

// ====================== ENV CONFIG ======================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || "https://your-app.vercel.app";
const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((id) => parseInt(id.trim()))
  .filter(Boolean);

// 🚨 Create bot WITHOUT polling (for webhook)
const bot = new TelegramBot(TOKEN, { webHook: true });

// ---- In-memory data (replace with DB for production) ----
const users = new Map();
const rooms = new Map();
const transactions = new Map();
const withdrawalRequests = new Map();

// ====================== FIREBASE USER REG ======================
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

// ====================== BOT COMMANDS ======================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;

  await registerUserToFirebase(user);

  const welcomeText = `
🎯 Welcome to Friday Bingo! 🎯

Available commands:
/playgame - Launch the bingo mini app
/deposit - Add funds to your account 
/withdraw - Withdraw your winnings 

Let's play some bingo! 🎊
  `;

  bot.sendMessage(chatId, welcomeText);
});

bot.onText(/\/playgame/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;

  await registerUserToFirebase(user);

  if (!users.has(user.id)) {
    users.set(user.id, {
      id: user.id,
      username: user.username || `user_${user.id}`,
      firstName: user.first_name || "",
      lastName: user.last_name || "",
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

  bot.sendMessage(chatId, "🎯 Ready to play Friday Bingo? Tap the button below!", {
    reply_markup: keyboard,
  });
});

bot.onText(/\/deposit/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!users.has(userId)) {
    bot.sendMessage(chatId, "እባክዎ በመጀመሪያ /playgame ይተይቡ።");
    return;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "📱 CBE Mobile Banking", callback_data: "deposit_cbe" }],
      [{ text: "💳 Telebirr", callback_data: "deposit_telebirr" }],
    ],
  };

  bot.sendMessage(chatId, "የክፍያ መንገዱን ይምረጡ:", { reply_markup: keyboard });
});

bot.onText(/\/withdraw/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!users.has(userId)) {
    bot.sendMessage(chatId, "እባክዎ በመጀመሪያ /playgame ይተይቡ።");
    return;
  }

  const user = users.get(userId);
  bot.sendMessage(
    chatId,
    `💰 የአሁን ሂሳብዎ: ${user.balance} ብር\n\nየሚወጣውን መጠን ይላኩ (ምሳሌ: 100):`
  );

  bot.once("message", (amountMsg) => {
    const amount = parseFloat(amountMsg.text);

    if (isNaN(amount) || amount <= 0) {
      bot.sendMessage(chatId, "❌ ትክክለኛ መጠን ያስገቡ።");
      return;
    }

    if (amount > user.balance) {
      bot.sendMessage(chatId, "❌ በቂ ሂሳብ የለዎትም።");
      return;
    }

    bot.sendMessage(
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

      bot.sendMessage(
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

          bot.sendMessage(
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
    bot.sendMessage(
      chatId,
      '📱 CBE Mobile Banking SMS ደረሰኞን ይላኩ:\n\nምሳሌ: "CBE: Transaction successful. Amount: 100.00 ETB. Ref: TXN123456789. Balance: 500.00 ETB. Time: 15:30 12/01/2024"'
    );

    bot.once("message", async (smsMsg) => {
      const smsText = smsMsg.text;
      const transactionDetails = await parseCBESMS(smsText);

      if (transactionDetails) {
        await processDeposit(userId, transactionDetails, chatId);
      } else {
        bot.sendMessage(chatId, "❌ ትክክለኛ CBE SMS ያስገቡ።");
      }
    });
  } else if (data === "deposit_telebirr") {
    bot.sendMessage(
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
        bot.sendMessage(chatId, "❌ ትክክለኛ Telebirr ደረሰኝ ያስገቡ።");
      }
    });
  } else if (data.startsWith("complete_withdrawal_")) {
    const requestId = data.replace("complete_withdrawal_", "");
    const request = withdrawalRequests.get(requestId);

    if (request && request.status === "pending") {
      request.status = "completed";
      withdrawalRequests.set(requestId, request);

      bot.sendMessage(
        request.userId,
        `✅ የማውጫ ጥያቄዎ ተፈጽሟል!\n\n💵 መጠን: ${request.amount} ብር\n🏦 አካውንት: ${request.account}`
      );

      bot.sendMessage(chatId, `✅ የማውጫ ጥያቄ ${requestId} ተፈጽሟል።`);
    }
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

// ====================== ADMIN COMMANDS ======================
bot.onText(/\/admin_create_room/, (msg) => {
  const userId = msg.from.id;
  if (!ADMIN_IDS.includes(userId)) {
    bot.sendMessage(msg.chat.id, "❌ You are not authorized.");
    return;
  }

  bot.sendMessage(
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

      bot.sendMessage(msg.chat.id, `✅ Room "${name}" created successfully!`);
    } else {
      bot.sendMessage(msg.chat.id, "❌ Invalid format. Try again.");
    }
  });
});

bot.onText(/\/admin_balance (.+) (.+)/, (msg, match) => {
  const userId = msg.from.id;
  if (!ADMIN_IDS.includes(userId)) {
    bot.sendMessage(msg.chat.id, "❌ You are not authorized.");
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

    bot.sendMessage(
      msg.chat.id,
      `✅ Balance updated for @${username}:\nNew balance: ${targetUser.balance} ETB`
    );

    bot.sendMessage(
      targetUser.id,
      `💰 Your balance has been updated!\nChange: ${
        amount > 0 ? "+" : ""
      }${amount} ETB\nNew balance: ${targetUser.balance} ETB`
    );
  } else {
    bot.sendMessage(msg.chat.id, `❌ User @${username} not found.`);
  }
});

// ====================== UTILS ======================
async function parseCBESMS(smsText) {
  const amountMatch = smsText.match(/Amount:\s*(\d+\.?\d*)/i);
  const refMatch = smsText.match(/Ref:\s*(\w+)/i);

  if (amountMatch && refMatch) {
    const transactionId = refMatch[1];
    if (transactions.has(transactionId)) return null;

    return {
      amount: parseFloat(amountMatch[1]),
      transactionId,
      method: "CBE",
      timestamp: new Date(),
    };
  }
  return null;
}

async function parseTelebirrSMS(smsText) {
  const amountMatch = smsText.match(/(\d+\.?\d*)\s*ETB/i);
  const refMatch = smsText.match(/(TXN\w+|REF\w+|\w{8,})/i);

  if (amountMatch && refMatch) {
    const transactionId = refMatch[1];
    if (transactions.has(transactionId)) return null;

    return {
      amount: parseFloat(amountMatch[1]),
      transactionId,
      method: "Telebirr",
      timestamp: new Date(),
    };
  }
  return null;
}

async function scrapeTelebirrReceipt(url) {
  const mockTransactionId = `WEB_${Date.now()}`;
  const mockAmount = 100;
  if (transactions.has(mockTransactionId)) return null;

  return {
    amount: mockAmount,
    transactionId: mockTransactionId,
    method: "Telebirr Web",
    timestamp: new Date(),
  };
}

async function processDeposit(userId, transactionDetails, chatId) {
  const user = users.get(userId);
  if (!user) {
    bot.sendMessage(chatId, "❌ ተጠቃሚ አልተገኘም።");
    return;
  }

  transactions.set(transactionDetails.transactionId, {
    ...transactionDetails,
    userId,
    status: "completed",
  });

  user.balance += transactionDetails.amount;
  users.set(userId, user);

  bot.sendMessage(
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


export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      // ✅ Parse body
      let body = req.body;
      if (!body || typeof body !== "object") {
        const raw = await new Promise((resolve) => {
          let data = "";
          req.on("data", (chunk) => (data += chunk));
          req.on("end", () => resolve(data));
        });
        body = JSON.parse(raw || "{}");
      }

      console.log("📩 Telegram update received:", JSON.stringify(body, null, 2));

      // Pass Telegram update to the bot
      await bot.processUpdate(body);

      return res.status(200).send("OK");
    } catch (err) {
      console.error("❌ Error processing update:", err);
      return res.status(500).send("Error");
    }
  }

  if (req.method === "GET") {
    // ✅ Telegram sometimes sends GET to test the webhook
    return res.status(200).send("Webhook is working ✅");
  }

  return res.status(405).send("Method Not Allowed");
}
