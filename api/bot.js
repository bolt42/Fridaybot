import { ref, get, set } from "firebase/database";
import { rtdb } from "../bot/firebaseConfig.js"; // adjust path

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
const pendingActions = new Map(); // <-- track "next step" for users

// ====================== TELEGRAM HELPERS ======================
async function telegram(method, payload) {
  const url = `https://api.telegram.org/bot${TOKEN}/${method}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) console.error("❌ Telegram API error:", data);
    return data;
  } catch (err) {
    console.error("❌ Fetch error:", err);
  }
}


async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", { chat_id: chatId, text, ...extra });
}

// ====================== USER REGISTRATION ======================
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

async function handleDeposit(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;

  if (!users.has(userId)) {
    await sendMessage(chatId, "እባክዎ በመጀመሪያ /playgame ይተይቡ።");
    return;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "📱 CBE Mobile Banking", callback_data: "deposit_cbe" }],
      [{ text: "💳 Telebirr", callback_data: "deposit_telebirr" }],
    ],
  };

  await sendMessage(chatId, "የክፍያ መንገዱን ይምረጡ:", { reply_markup: keyboard });
}

async function handleWithdraw(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;

  if (!users.has(userId)) {
    await sendMessage(chatId, "እባክዎ በመጀመሪያ /playgame ይተይቡ።");
    return;
  }

  const user = users.get(userId);
  await sendMessage(
    chatId,
    `💰 የአሁን ሂሳብዎ: ${user.balance} ብር\n\nየሚወጣውን መጠን ይላኩ (ምሳሌ: 100):`
  );

  pendingActions.set(userId, { type: "awaiting_withdraw_amount" });
}

// ====================== CALLBACK HANDLER ======================
async function handleCallback(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  if (data === "deposit_cbe") {
    await sendMessage(
      chatId,
      "📱 CBE Mobile Banking SMS ደረሰኞን ይላኩ..."
    );
    pendingActions.set(userId, { type: "awaiting_cbe_sms" });
  } else if (data === "deposit_telebirr") {
    await sendMessage(
      chatId,
      "💳 Telebirr ደረሰኝ ይላኩ..."
    );
    pendingActions.set(userId, { type: "awaiting_telebirr_receipt" });
  } else if (data.startsWith("complete_withdrawal_")) {
    const requestId = data.replace("complete_withdrawal_", "");
    const request = withdrawalRequests.get(requestId);

    if (request && request.status === "pending") {
      request.status = "completed";
      withdrawalRequests.set(requestId, request);

      await sendMessage(
        request.userId,
        `✅ የማውጫ ጥያቄዎ ተፈጽሟል!\n\n💵 መጠን: ${request.amount} ብር\n🏦 አካውንት: ${request.account}`
      );

      await sendMessage(chatId, `✅ የማውጫ ጥያቄ ${requestId} ተፈጽሟል።`);
    }
  }

  await telegram("answerCallbackQuery", { callback_query_id: callbackQuery.id });
}

// ====================== MESSAGE FLOW (STATE MACHINE) ======================
async function handleUserMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text;

  const pending = pendingActions.get(userId);
  if (pending) {
    if (pending.type === "awaiting_withdraw_amount") {
      const amount = parseFloat(text);
      const user = users.get(userId);

      if (isNaN(amount) || amount <= 0) {
        await sendMessage(chatId, "❌ ትክክለኛ መጠን ያስገቡ።");
        return;
      }
      if (amount > user.balance) {
        await sendMessage(chatId, "❌ በቂ ሂሳብ የለዎትም።");
        return;
      }

      await sendMessage(chatId, "የመውጫ አካውንት መረጃ ይላኩ:");
      pendingActions.set(userId, { type: "awaiting_withdraw_account", amount });
      return;
    }

    if (pending.type === "awaiting_withdraw_account") {
      const account = text;
      const amount = pending.amount;
      const requestId = `${userId}_${Date.now()}`;

      const user = users.get(userId);
      user.balance -= amount;
      users.set(userId, user);

      withdrawalRequests.set(requestId, {
        id: requestId,
        userId,
        amount,
        account,
        status: "pending",
        createdAt: new Date(),
      });

      await sendMessage(
        chatId,
        "⏳ የማውጫ ጥያቄዎ ተቀበለ። እባክዎ ይጠብቁ..."
      );

      // notify admins
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
            `💰 የማውጫ ጥያቄ:\n👤 User: @${
              user.username || userId
            }\n💵 መጠን: ${amount} ብር\n🏦 አካውንት: ${account}`,
            { reply_markup: keyboard }
          );
        }
      });

      pendingActions.delete(userId);
      return;
    }

    if (pending.type === "awaiting_cbe_sms") {
      await sendMessage(chatId, "👉 CBE SMS received (parser not yet implemented).");
      pendingActions.delete(userId);
      return;
    }

    if (pending.type === "awaiting_telebirr_receipt") {
      await sendMessage(chatId, "👉 Telebirr receipt received (parser not yet implemented).");
      pendingActions.delete(userId);
      return;
    }
  }

  // ---- Commands ----
  if (text === "/start") return handleStart(message);
  if (text === "/playgame") return handlePlayGame(message);
  if (text === "/deposit") return handleDeposit(message);
  if (text === "/withdraw") return handleWithdraw(message);

  await sendMessage(chatId, `You said: ${text}`);
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

    if (update.message) {
      await handleUserMessage(update.message);
    }
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    }

    return res.status(200).json({ ok: true }); // respond AFTER processing
  } catch (err) {
    console.error("❌ Error in handler:", err);
    return res.status(200).json({ ok: true }); // still ACK to Telegram
  }
}


  res.status(405).json({ error: "Method not allowed" });
}
