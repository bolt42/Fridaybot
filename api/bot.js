import { ref, get, set, update } from "firebase/database";
import { rtdb } from "../bot/firebaseConfig.js"; 
import fetch from "node-fetch";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((id) => parseInt(id.trim()))
  .filter(Boolean);

// ====================== TELEGRAM HELPERS ======================
async function telegram(method, payload) {
  const url = `https://api.telegram.org/bot${TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", { chat_id: chatId, text, ...extra });
}

// ====================== USER MANAGEMENT ======================
async function registerUserToFirebase(user) {
  const userRef = ref(rtdb, "users/" + user.id);
  const snapshot = await get(userRef);

  if (!snapshot.exists()) {
    const now = new Date().toISOString();
    const newUser = {
      telegramId: user.id.toString(),
      username: user.username || `user_${user.id}`,
      balance: 50,
      createdAt: now,
      updatedAt: now,
    };
    await set(userRef, newUser);
  }
}

// ====================== MESSAGE HELPERS ======================
function extractUrlFromText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

// ====================== HANDLERS ======================
async function handleStart(message) {
  const chatId = message.chat.id;
  await registerUserToFirebase(message.from);

  await sendMessage(chatId, `
🎯 Welcome to Friday Bingo!

Commands:
/deposit - Add funds
/withdraw - Withdraw winnings
/playgame - Launch game
`);
}

async function handleDeposit(message) {
  const chatId = message.chat.id;
  const keyboard = {
    inline_keyboard: [
      [{ text: "📱 CBE Mobile Banking", callback_data: "deposit_cbe" }],
      [{ text: "💳 Telebirr", callback_data: "deposit_telebirr" }],
    ],
  };
  await sendMessage(chatId, "Choose payment method:", { reply_markup: keyboard });
}

async function handleWithdraw(message) {
  const chatId = message.chat.id;
  await sendMessage(chatId, "💵 Enter withdrawal amount:");
  pendingActions.set(message.from.id, { type: "awaiting_withdraw_amount" });
}

// ====================== STATE MACHINE ======================
const pendingActions = new Map();
const depositRequests = new Map();
const withdrawalRequests = new Map();

async function handleUserMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text;
  const userRef = ref(rtdb, "users/" + userId);
  const userSnap = await get(userRef);
  const user = userSnap.val();

  const pending = pendingActions.get(userId);

  if (pending?.type === "awaiting_deposit_sms") {
  const url = extractUrlFromText(text);
  if (!url) {
    await sendMessage(chatId, "❌ No link found. Please resend SMS.");
    return;
  }

  // 🔍 Check if link already used
  const depositsRef = ref(rtdb, "deposits");
  const snapshot = await get(depositsRef);
  if (snapshot.exists()) {
    const deposits = snapshot.val();
    const alreadyUsed = Object.values(deposits).some(dep => dep.url === url);
    if (alreadyUsed) {
      await sendMessage(chatId, "❌ This receipt has already been used.");
      pendingActions.delete(userId);
      return;
    }
  }

  // Create new request
  const requestId = `dep_${userId}_${Date.now()}`;
  depositRequests.set(requestId, { 
    userId, 
    amount: pending.amount, 
    url, 
    method: pending.method, 
    status: "pending" 
  });

  ADMIN_IDS.forEach(adminId => {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "✅ Approve", callback_data: `approve_deposit_${requestId}` },
          { text: "❌ Decline", callback_data: `decline_deposit_${requestId}` },
        ],
      ],
    };
    sendMessage(
      adminId, 
      `💵 Deposit request:\n👤 @${user.username || userId}\nMethod: ${pending.method}\nAmount: ${pending.amount}\n🔗 Link: ${url}`, 
      { reply_markup: keyboard }
    );
  });

  await sendMessage(chatId, "⏳ Deposit request sent. Please wait for admin approval.");
  pendingActions.delete(userId);
  return;
}


  if (text === "/start") return handleStart(message);
  if (text === "/deposit") return handleDeposit(message);
  if (text === "/withdraw") return handleWithdraw(message);

  await sendMessage(chatId, "Send /deposit or /withdraw to start.");
}

// ====================== CALLBACKS ======================
async function handleCallback(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  // Deposit
  if (data === "deposit_cbe" || data === "deposit_telebirr") {
    const method = data === "deposit_cbe" ? "CBE" : "Telebirr";
    await sendMessage(chatId, `Enter deposit amount for ${method}:`);
    pendingActions.set(userId, { type: "awaiting_deposit_amount", method });
    return;
  }

  if (data.startsWith("approve_deposit_")) {
    const requestId = data.replace("approve_deposit_", "");
    const req = depositRequests.get(requestId);
    if (!req) return;

    const userRef = ref(rtdb, "users/" + req.userId);
    const snap = await get(userRef);
    if (snap.exists()) {
      const newBalance = (snap.val().balance || 0) + req.amount;
      await update(userRef, { balance: newBalance });

      // Notify player
      await sendMessage(req.userId, `✅ Deposit approved!\n+${req.amount} birr credited.`);

      // Notify admin
      await sendMessage(chatId, `✅ You approved deposit for @${snap.val().username || req.userId}, amount: ${req.amount}`);
    }

    depositRequests.delete(requestId);
  }

  if (data.startsWith("decline_deposit_")) {
    const requestId = data.replace("decline_deposit_", "");
    const req = depositRequests.get(requestId);
    if (!req) return;

    // Notify player
    await sendMessage(req.userId, "❌ Your deposit was declined.");

    // Notify admin
    await sendMessage(chatId, `❌ You declined deposit for @${req.userId}, amount: ${req.amount}`);

    depositRequests.delete(requestId);
  }

  // Withdraw
  if (data.startsWith("approve_withdraw_")) {
    const requestId = data.replace("approve_withdraw_", "");
    const req = withdrawalRequests.get(requestId);
    if (!req) return;

    const userRef = ref(rtdb, "users/" + req.userId);
    const snap = await get(userRef);
    if (snap.exists()) {
      const user = snap.val();
      const newBalance = (user.balance || 0) - req.amount;
      await update(userRef, { balance: newBalance });

      // Notify player
      await sendMessage(req.userId, `✅ Withdraw approved!\n-${req.amount} birr paid to account: ${req.account}`);

      // Notify admin
      await sendMessage(chatId, `✅ You marked withdraw as paid for @${user.username || req.userId}, amount: ${req.amount}`);
    }

    withdrawalRequests.delete(requestId);
  }

  if (data.startsWith("decline_withdraw_")) {
    const requestId = data.replace("decline_withdraw_", "");
    const req = withdrawalRequests.get(requestId);
    if (!req) return;

    // Notify player
    await sendMessage(req.userId, "❌ Your withdrawal request was declined.");

    // Notify admin
    await sendMessage(chatId, `❌ You declined withdraw request for @${req.userId}, amount: ${req.amount}`);

    withdrawalRequests.delete(requestId);
  }

  telegram("answerCallbackQuery", { callback_query_id: callbackQuery.id });
}

// ====================== MAIN HANDLER ======================
export default async function handler(req, res) {
  if (req.method === "POST") {
    const update = req.body;
    if (update.message) await handleUserMessage(update.message);
    if (update.callback_query) await handleCallback(update.callback_query);
    return res.json({ ok: true });
  }
  res.status(200).json({ status: "Bot running" });
}
