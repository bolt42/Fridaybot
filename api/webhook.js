import { Telegraf, Markup } from 'telegraf';
import admin from 'firebase-admin';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Admin user IDs
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id)) : [];

// Mini app URL
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://your-app.vercel.app';

// Language texts
const texts = {
  am: {
    welcome: 'እንኳን ወደ ዓርብ ቢንጎ በደህና መጣህ! /playgame ተጫውተህ ጨዋታውን ጀምር።',
    gameStarted: 'ጨዋታው ተጀምሯል! ከታች ያለውን ቁልፍ ተጫን።',
    playGame: '🎮 ዓርብ ቢንጎ ተጫወት',
    deposit: 'ገንዘብ አስቀምጥ 💰',
    withdraw: 'ገንዘብ አውጣ 💸',
    balance: 'ባላንስ 💳',
    choosePaymentMethod: 'የመክፈያ ዘዴ ምረጥ:',
    cbe: 'CBE ባንክ',
    telebirr: 'ቴሌብር',
    sendReceipt: 'የSMS ደረሰኝ ላክ:',
    receiptReceived: 'ደረሰኙ ተቀብሏል። እየተሠራ ነው...',
    invalidReceipt: 'ደረሰኙ ልክ አይደለም። እንደገና ሞክር።',
    depositSuccessful: 'ገንዘብ በተሳካ ሁኔታ ተቀምጧል! አዲስ ባላንስ:',
    enterWithdrawAmount: 'የማውጣት መጠን ላክ:',
    enterAccountDetails: 'የባንክ ሂሳብ ወይም ቴሌብር ቁጥር ላክ:',
    withdrawalRequested: 'የማውጣት ጥያቄ ተደርጓል። እባክዎን ይጠብቁ...',
    insufficientBalance: 'በቂ ባላንስ የለዎትም።',
    onlyAmharic: 'ይህ ትዕዛዝ በአማርኛ ብቻ ይሠራል።',
    userNotFound: 'ተጠቃሚ አልተገኘም። በመጀመሪያ /playgame ይጫኑ።',
    adminOnly: 'ይህ ትዕዛዝ ለአስተዳዳሪዎች ብቻ ነው።'
  },
  en: {
    welcome: 'Welcome to Friday Bingo! Use /playgame to start playing.',
    gameStarted: 'Game started! Click the button below.',
    playGame: '🎮 Play Friday Bingo',
    deposit: 'Deposit 💰',
    withdraw: 'Withdraw 💸',
    balance: 'Balance 💳',
    choosePaymentMethod: 'Choose payment method:',
    cbe: 'CBE Bank',
    telebirr: 'Telebirr',
    sendReceipt: 'Send SMS receipt:',
    receiptReceived: 'Receipt received. Processing...',
    invalidReceipt: 'Invalid receipt. Please try again.',
    depositSuccessful: 'Deposit successful! New balance:',
    enterWithdrawAmount: 'Enter withdrawal amount:',
    enterAccountDetails: 'Send bank account or Telebirr number:',
    withdrawalRequested: 'Withdrawal requested. Please wait...',
    insufficientBalance: 'Insufficient balance.',
    onlyAmharic: 'This command only works in Amharic.',
    userNotFound: 'User not found. Please use /playgame first.',
    adminOnly: 'This command is for admins only.'
  }
};

// Helper functions
const getUserLanguage = async (userId) => {
  try {
    const userDoc = await db.collection('users').doc(userId.toString()).get();
    return userDoc.exists ? userDoc.data().language || 'en' : 'en';
  } catch (error) {
    return 'en';
  }
};

const getText = (lang, key) => {
  return texts[lang] && texts[lang][key] ? texts[lang][key] : texts.en[key];
};

const createOrUpdateUser = async (ctx) => {
  const userId = ctx.from.id.toString();
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    await userRef.set({
      telegramId: ctx.from.id.toString(),
      username: ctx.from.username || '',
      firstName: ctx.from.first_name || '',
      lastName: ctx.from.last_name || '',
      balance: 50, // Initial bonus
      language: 'en',
      isAdmin: ADMIN_IDS.includes(ctx.from.id),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActive: admin.firestore.FieldValue.serverTimestamp()
    });
    return true; // New user
  } else {
    await userRef.update({
      lastActive: admin.firestore.FieldValue.serverTimestamp()
    });
    return false; // Existing user
  }
};

const parseReceiptSMS = (text) => {
  // CBE Bank SMS pattern
  const cbePattern = /Transaction ID:\s*(\d+).*Amount:\s*ETB\s*([\d,]+\.?\d*)/i;
  const cbeMatch = text.match(cbePattern);
  
  if (cbeMatch) {
    return {
      method: 'cbe',
      transactionId: cbeMatch[1],
      amount: parseFloat(cbeMatch[2].replace(/,/g, ''))
    };
  }

  // Telebirr SMS pattern
  const telebirrPattern = /(?:Transaction|Ref):\s*(\w+).*(?:Amount|ETB):\s*([\d,]+\.?\d*)/i;
  const telebirrMatch = text.match(telebirrPattern);
  
  if (telebirrMatch) {
    return {
      method: 'telebirr',
      transactionId: telebirrMatch[1],
      amount: parseFloat(telebirrMatch[2].replace(/,/g, ''))
    };
  }

  return null;
};

const validateTransaction = async (transactionId, method) => {
  // Check if transaction ID already exists
  const transactionsRef = db.collection('transactions');
  const query = await transactionsRef
    .where('details.transactionId', '==', transactionId)
    .where('method', '==', method)
    .get();

  return query.empty; // Return true if unique
};

// Bot commands
bot.command('start', async (ctx) => {
  const isNewUser = await createOrUpdateUser(ctx);
  const lang = await getUserLanguage(ctx.from.id);
  
  let welcomeMessage = getText(lang, 'welcome');
  if (isNewUser) {
    welcomeMessage += ` You received 50 Birr as welcome bonus!`;
  }

  ctx.reply(welcomeMessage, 
    Markup.keyboard([
      [getText(lang, 'playGame')],
      [getText(lang, 'deposit'), getText(lang, 'withdraw')],
      [getText(lang, 'balance')]
    ]).resize()
  );
});

bot.command('playgame', async (ctx) => {
  await createOrUpdateUser(ctx);
  const lang = await getUserLanguage(ctx.from.id);
  
  ctx.reply(
    getText(lang, 'gameStarted'),
    Markup.inlineKeyboard([
      Markup.button.webApp(getText(lang, 'playGame'), MINI_APP_URL)
    ])
  );
});

// Deposit flow (Amharic only)
bot.command('deposit', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id);
  
  if (lang !== 'am') {
    return ctx.reply(getText(lang, 'onlyAmharic'));
  }

  ctx.session = { ...ctx.session, step: 'choose_payment' };
  
  ctx.reply(
    getText(lang, 'choosePaymentMethod'),
    Markup.keyboard([
      [getText(lang, 'cbe'), getText(lang, 'telebirr')]
    ]).resize()
  );
});

// Handle payment method selection
bot.hears(/CBE|ቴሌብር/, async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id);
  
  if (ctx.session?.step === 'choose_payment') {
    const method = ctx.message.text.includes('CBE') ? 'cbe' : 'telebirr';
    ctx.session = { ...ctx.session, step: 'send_receipt', method };
    
    ctx.reply(getText(lang, 'sendReceipt'));
  }
});

// Withdrawal flow (Amharic only)
bot.command('withdraw', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id);
  
  if (lang !== 'am') {
    return ctx.reply(getText(lang, 'onlyAmharic'));
  }

  ctx.session = { ...ctx.session, step: 'enter_amount' };
  ctx.reply(getText(lang, 'enterWithdrawAmount'));
});

// Balance command
bot.command('balance', async (ctx) => {
  const userId = ctx.from.id.toString();
  const lang = await getUserLanguage(ctx.from.id);
  
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (userDoc.exists) {
      const balance = userDoc.data().balance || 0;
      ctx.reply(`${getText(lang, 'balance')}: ${balance.toLocaleString()} Birr`);
    } else {
      ctx.reply(getText(lang, 'userNotFound'));
    }
  } catch (error) {
    ctx.reply('Error fetching balance.');
  }
});

// Admin commands
bot.command('admin', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    const lang = await getUserLanguage(ctx.from.id);
    return ctx.reply(getText(lang, 'adminOnly'));
  }

  ctx.reply(
    'Admin Panel',
    Markup.keyboard([
      ['Create Room', 'List Rooms'],
      ['Pending Withdrawals', 'User Balance'],
      ['Game Stats', 'Back']
    ]).resize()
  );
});

// Handle text messages (for deposits, withdrawals, etc.)
bot.on('text', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  
  const userId = ctx.from.id.toString();
  const lang = await getUserLanguage(ctx.from.id);

  // Handle receipt submission
  if (ctx.session.step === 'send_receipt') {
    const receiptData = parseReceiptSMS(ctx.message.text);
    
    if (!receiptData) {
      return ctx.reply(getText(lang, 'invalidReceipt'));
    }

    const isUnique = await validateTransaction(receiptData.transactionId, receiptData.method);
    
    if (!isUnique) {
      return ctx.reply(getText(lang, 'invalidReceipt'));
    }

    ctx.reply(getText(lang, 'receiptReceived'));

    // Create transaction record
    const transactionRef = await db.collection('transactions').add({
      userId: userId,
      type: 'deposit',
      amount: receiptData.amount,
      method: receiptData.method,
      status: 'completed',
      details: receiptData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update user balance
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      balance: admin.firestore.FieldValue.increment(receiptData.amount)
    });

    // Get new balance
    const userDoc = await userRef.get();
    const newBalance = userDoc.data().balance;

    ctx.reply(`${getText(lang, 'depositSuccessful')} ${newBalance.toLocaleString()} Birr`);
    
    ctx.session = {};
    return;
  }

  // Handle withdrawal amount
  if (ctx.session.step === 'enter_amount') {
    const amount = parseFloat(ctx.message.text);
    
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('Invalid amount. Please enter a valid number.');
    }

    // Check user balance
    const userDoc = await db.collection('users').doc(userId).get();
    const balance = userDoc.data()?.balance || 0;
    
    if (balance < amount) {
      return ctx.reply(getText(lang, 'insufficientBalance'));
    }

    ctx.session = { ...ctx.session, step: 'enter_account', amount };
    ctx.reply(getText(lang, 'enterAccountDetails'));
    return;
  }

  // Handle account details for withdrawal
  if (ctx.session.step === 'enter_account') {
    const accountDetails = ctx.message.text;
    const amount = ctx.session.amount;

    // Create withdrawal request
    const withdrawalRef = await db.collection('withdrawal_requests').add({
      userId: userId,
      username: ctx.from.username || '',
      amount: amount,
      accountType: accountDetails.includes('@') || accountDetails.length > 10 ? 'bank' : 'telebirr',
      accountDetails: accountDetails,
      status: 'pending',
      requestedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Lock funds (reduce balance)
    await db.collection('users').doc(userId).update({
      balance: admin.firestore.FieldValue.increment(-amount)
    });

    ctx.reply(getText(lang, 'withdrawalRequested'));

    // Notify admins
    for (const adminId of ADMIN_IDS) {
      try {
        bot.telegram.sendMessage(
          adminId,
          `New withdrawal request:\nUser: @${ctx.from.username}\nAmount: ${amount} Birr\nAccount: ${accountDetails}`,
          Markup.inlineKeyboard([
            Markup.button.callback('✅ Approve', `approve_${withdrawalRef.id}`),
            Markup.button.callback('❌ Reject', `reject_${withdrawalRef.id}`)
          ])
        );
      } catch (error) {
        console.log('Error notifying admin:', error);
      }
    }

    ctx.session = {};
    return;
  }
});

// Handle admin approval/rejection
bot.action(/^(approve|reject)_(.+)$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('Unauthorized');
  }

  const action = ctx.match[1];
  const requestId = ctx.match[2];

  try {
    const requestRef = db.collection('withdrawal_requests').doc(requestId);
    const requestDoc = await requestRef.get();
    
    if (!requestDoc.exists) {
      return ctx.answerCbQuery('Request not found');
    }

    const requestData = requestDoc.data();
    
    if (action === 'approve') {
      await requestRef.update({
        status: 'completed',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: ctx.from.id.toString()
      });

      // Notify user
      try {
        await bot.telegram.sendMessage(
          requestData.userId,
          `Your withdrawal of ${requestData.amount} Birr has been processed successfully!`
        );
      } catch (error) {
        console.log('Error notifying user:', error);
      }

      ctx.editMessageText(`✅ Withdrawal approved for ${requestData.amount} Birr`);
    } else {
      await requestRef.update({
        status: 'cancelled',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: ctx.from.id.toString()
      });

      // Return funds to user
      await db.collection('users').doc(requestData.userId).update({
        balance: admin.firestore.FieldValue.increment(requestData.amount)
      });

      // Notify user
      try {
        await bot.telegram.sendMessage(
          requestData.userId,
          `Your withdrawal request of ${requestData.amount} Birr has been cancelled. Funds returned to your account.`
        );
      } catch (error) {
        console.log('Error notifying user:', error);
      }

      ctx.editMessageText(`❌ Withdrawal rejected for ${requestData.amount} Birr`);
    }
    
    ctx.answerCbQuery();
  } catch (error) {
    console.log('Error processing withdrawal:', error);
    ctx.answerCbQuery('Error processing request');
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.log(`Error for ${ctx.updateType}:`, err);
});

// Vercel serverless function export
export default async function handler(req, res) {
  // Handle webhook requests
  if (req.method === 'POST') {
    try {
      // Process the webhook update
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}