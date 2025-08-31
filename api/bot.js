import { ref, get, set } from "firebase/database";
import { rtdb } from "../bot/firebaseConfig.js"; // adjust path
import crypto from "crypto";
import fetch from "node-fetch";
import * as cheerio from "cheerio"; 
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";


// ====================== ENV CONFIG ======================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || "https://fridaybots.vercel.app";
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
// ====================== receipt analyzer ========================
function extractUrlFromText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}
async function parseTelebirrReceipt(url) {
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const txId = $("td.receipttableTd2").first().text().trim();
  const paymentDate = $("td.receipttableTd").eq(1).text().trim();
  const amountRaw = $("td.receipttableTd").eq(2).text().trim();
  const amount = parseFloat(amountRaw.replace(/[^\d.]/g, ""));

  let receiverAccount = $("#paid_reference_number").text().trim();
  let receiverName = "";
  if (receiverAccount) {
    const parts = receiverAccount.split(/\s+/);
    receiverAccount = parts[0];
    receiverName = parts.slice(1).join(" ");
  } else {
    receiverName = $("td:contains('Credited Party name')").next().text().trim();
    receiverAccount = $("td:contains('Credited party account no')").next().text().trim();
  }

  return { txId, paymentDate, amount, receiverName, receiverAccount, source: "telebirr" };
}


async function parseCbeReceipt(url) {
  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());

  const pdf = await getDocument({ data: buffer }).promise;

  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(" ") + "\n";
  }

  // Extract fields
  const txId = text.match(/Reference No.*?([A-Z0-9]+)/)?.[1];
  const paymentDate = text.match(/Payment Date & Time\s+([^\n]+)/)?.[1]?.trim();
  const amount = parseFloat(text.match(/Transferred Amount\s+([\d.]+)/)?.[1]);

  const receiverName = text.match(/Receiver\s+([A-Z ]+)/)?.[1]?.trim();
  const receiverAccount = text.match(/Account\s+([*0-9]+)/)?.[1]?.trim();

  return { txId, paymentDate, amount, receiverName, receiverAccount, source: "cbe" };
}
const EXPECTED_RECEIVER = {
  name: "EYOB WASIHUN GETAHUN", // set this to your real expected name
  telebirr: "2519****5523",     // expected telebirr account/phone
  cbeAccount: "1****4639",      // expected CBE account
};

async function registerTransaction(userId, tx) {
  const txRef = ref(rtdb, "transactions/" + tx.txId);
  const snap = await get(txRef);
  if (snap.exists()) throw new Error("Duplicate transaction");

  // validate receiver
  if (tx.receiverName.toLowerCase() !== EXPECTED_RECEIVER.name.toLowerCase()) {
    throw new Error("Receiver name mismatch");
  }
  if (
    (tx.source === "telebirr" && tx.receiverAccount !== EXPECTED_RECEIVER.telebirr) ||
    (tx.source === "cbe" && tx.receiverAccount !== EXPECTED_RECEIVER.cbeAccount)
  ) {
    throw new Error("Receiver account mismatch");
  }

  await set(txRef, { ...tx, userId, createdAt: new Date().toISOString() });

  const userRef = ref(rtdb, "users/" + userId);
  const userSnap = await get(userRef);
  if (userSnap.exists()) {
    const user = userSnap.val();
    const newBalance = (user.balance || 0) + tx.amount;
    await update(userRef, { balance: newBalance, updatedAt: new Date().toISOString() });
  }
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

  const baseUrl = "https://fridaybots.vercel.app" // fallback for local dev

const sigRes = await fetch(`${baseUrl}/api/signuser?id=${user.id}`);
const { sig } = await sigRes.json();

const userUrl = `${WEBAPP_URL}/?id=${user.id}&sig=${sig}`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🎮 Play Friday Bingo",
          web_app: { url: userUrl },
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
    await sendMessage(chatId, "💵 እባክዎ የሚያስገቡትን መጠን ያስገቡ (ምሳሌ: 200)");
    pendingActions.set(userId, { type: "awaiting_deposit_amount", method: "cbe" });
  } else if (data === "deposit_telebirr") {
    await sendMessage(chatId, "💵 እባክዎ የሚያስገቡትን መጠን ያስገቡ (ምሳሌ: 200)");
    pendingActions.set(userId, { type: "awaiting_deposit_amount", method: "telebirr" });
  }  else if (data.startsWith("complete_withdrawal_")) {
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

   if (pending.type === "awaiting_deposit_amount") {
      const amount = parseFloat(text);

      if (isNaN(amount) || amount <= 0) {
        await sendMessage(chatId, "❌ ትክክለኛ መጠን ያስገቡ።");
        return;
      }

      if (pending.method === "cbe") {
        await sendMessage(chatId, `📱 እባክዎ የ CBE የክፍያ ደረሰኝ ይላኩ።\n💵 መጠን: ${amount} ብር`);
        pendingActions.set(userId, { type: "awaiting_cbe_sms", amount });
      }

      if (pending.method === "telebirr") {
        await sendMessage(chatId, `💳 እባክዎ የ Telebirr ደረሰኝ ይላኩ።\n💵 መጠን: ${amount} ብር`);
        pendingActions.set(userId, { type: "awaiting_telebirr_receipt", amount });
      }

      return;
    }

    if (pending.type === "awaiting_cbe_sms" || pending.type === "awaiting_telebirr_receipt") {
  const url = extractUrlFromText(text);
  if (!url) {
    await sendMessage(chatId, "❌ No receipt link found in your message. Please resend the SMS text.");
    return;
  }

  try {
    let tx;
    if (url.includes("transactioninfo.ethiotelecom.et/receipt")) {
      // Telebirr
      tx = await parseTelebirrReceipt(url);
    } else if (url.includes("apps.cbe.com.et:100/BranchReceipt")) {
      // CBE PDF
      tx = await parseCbeReceipt(url);
    } else {
      throw new Error("Unknown receipt type (URL not recognized)");
    }

    await registerTransaction(userId, tx);
    await sendMessage(
      chatId,
      `✅ Deposit successful!\n\n🧾 TxID: ${tx.txId}\n💵 Amount: ${tx.amount} birr\n📅 Date: ${tx.paymentDate}`
    );
  } catch (err) {
    console.error("❌ Deposit error:", err);
    await sendMessage(chatId, "❌ Deposit validation failed: " + err.message);
  }

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
