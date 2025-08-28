import { Telegraf, Markup } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, update, push } from 'firebase/database';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase
const firebaseConfig = {
  databaseURL: process.env.FIREBASE_DATABASE_URL
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const bot = new Telegraf(process.env.BOT_TOKEN || '');

// Check if bot token is available
if (!process.env.BOT_TOKEN) {
  console.error('BOT_TOKEN environment variable is not set!');
}

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
    deposit: '/deposit',
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
    deposit: '/deposit',
    withdraw: '/withdraw',
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
    const userRef = ref(db, `users/${userId}`);
    const userSnapshot = await get(userRef);
    const userData = userSnapshot.val();
    return userData ? userData.language || 'en' : 'en';
  } catch (error) {
    return 'en';
  }
};

const getText = (lang, key) => {
  return texts[lang] && texts[lang][key] ? texts[lang][key] : texts.en[key];
};

const createOrUpdateUser = async (ctx) => {
  const userId = ctx.from.id.toString();
  const userRef = ref(db, `users/${userId}`);
  const userSnapshot = await get(userRef);
  const userData = userSnapshot.val();

  if (!userData) {
    await set(userRef, {
      telegramId: ctx.from.id.toString(),
      username: ctx.from.username || '',
      firstName: ctx.from.first_name || '',
      lastName: ctx.from.last_name || '',
      balance: 50, // Initial bonus
      language: 'en',
      isAdmin: ADMIN_IDS.includes(ctx.from.id),
      createdAt: Date.now(),
      lastActive: Date.now()
    });
    return true; // New user
  } else {
    await update(userRef, {
      lastActive: Date.now()
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
  const transactionsRef = ref(db, 'transactions');
  const snapshot = await get(transactionsRef);
  const transactions = snapshot.val();
  
  if (!transactions) return true; // No transactions exist, so it's unique
  
  // Check if transaction ID already exists
  for (const key in transactions) {
    const transaction = transactions[key];
    if (transaction.details?.transactionId === transactionId && transaction.method === method) {
      return false; // Transaction already exists
    }
  }
  
  return true; // Transaction is unique
};
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
    const userRef = ref(db, `users/${userId}`);
    const userSnapshot = await get(userRef);
    const userData = userSnapshot.val();
    
    if (userData) {
      const balance = userData.balance || 0;
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

// Handle admin text commands
bot.hears('Create Room', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('Unauthorized');
  }

  ctx.session = { ...ctx.session, step: 'create_room_name' };
  ctx.reply('Enter room name:');
});

// Test command to create a room quickly
bot.command('createroom', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('Unauthorized');
  }

  try {
    const roomsRef = ref(db, 'rooms');
    const newRoomRef = push(roomsRef);
    const roomId = newRoomRef.key;
    
    await set(newRoomRef, {
      name: `Test Room ${Date.now()}`,
      status: 'active',
      betAmount: 50,
      maxPlayers: 20,
      players: {},
      createdAt: Date.now(),
      createdBy: ctx.from.id.toString()
    });

    ctx.reply(`✅ Test room created successfully!\nRoom ID: ${roomId}`);
  } catch (error) {
    console.error('Error creating test room:', error);
    ctx.reply('❌ Error creating test room.');
  }
});

bot.hears('List Rooms', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('Unauthorized');
  }

  try {
    const roomsRef = ref(db, 'rooms');
    const snapshot = await get(roomsRef);
    const rooms = snapshot.val();

    if (!rooms) {
      return ctx.reply('No rooms found.');
    }

    let message = '📋 Active Rooms:\n\n';
    for (const [roomId, room] of Object.entries(rooms)) {
      const status = room.status || 'active';
      const playerCount = room.players ? Object.keys(room.players).length : 0;
      message += `🏠 ${room.name}\n`;
      message += `   ID: ${roomId}\n`;
      message += `   Status: ${status}\n`;
      message += `   Players: ${playerCount}\n`;
      message += `   Created: ${new Date(room.createdAt).toLocaleString()}\n\n`;
    }

    ctx.reply(message);
  } catch (error) {
    console.error('Error listing rooms:', error);
    ctx.reply('Error fetching rooms.');
  }
});

bot.hears('Pending Withdrawals', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('Unauthorized');
  }

  try {
    const withdrawalsRef = ref(db, 'withdrawal_requests');
    const snapshot = await get(withdrawalsRef);
    const withdrawals = snapshot.val();

    if (!withdrawals) {
      return ctx.reply('No pending withdrawals.');
    }

    const pendingWithdrawals = Object.entries(withdrawals).filter(([_, withdrawal]) => 
      withdrawal.status === 'pending'
    );

    if (pendingWithdrawals.length === 0) {
      return ctx.reply('No pending withdrawals.');
    }

    let message = '💰 Pending Withdrawals:\n\n';
    for (const [id, withdrawal] of pendingWithdrawals) {
      message += `👤 User: @${withdrawal.username}\n`;
      message += `💵 Amount: ${withdrawal.amount} Birr\n`;
      message += `🏦 Account: ${withdrawal.accountDetails}\n`;
      message += `📅 Requested: ${new Date(withdrawal.requestedAt).toLocaleString()}\n\n`;
    }

    ctx.reply(message);
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    ctx.reply('Error fetching withdrawals.');
  }
});

bot.hears('User Balance', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('Unauthorized');
  }

  ctx.session = { ...ctx.session, step: 'check_user_balance' };
  ctx.reply('Enter user ID or username (without @):');
});

bot.hears('Game Stats', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('Unauthorized');
  }

  try {
    const usersRef = ref(db, 'users');
    const transactionsRef = ref(db, 'transactions');
    const roomsRef = ref(db, 'rooms');

    const [usersSnapshot, transactionsSnapshot, roomsSnapshot] = await Promise.all([
      get(usersRef),
      get(transactionsRef),
      get(roomsRef)
    ]);

    const users = usersSnapshot.val() || {};
    const transactions = transactionsSnapshot.val() || {};
    const rooms = roomsSnapshot.val() || {};

    const totalUsers = Object.keys(users).length;
    const totalTransactions = Object.keys(transactions).length;
    const totalRooms = Object.keys(rooms).length;
    const totalDeposits = Object.values(transactions).filter(t => t.type === 'deposit').length;

    const message = `📊 Game Statistics:\n\n` +
      `👥 Total Users: ${totalUsers}\n` +
      `💰 Total Transactions: ${totalTransactions}\n` +
      `🏠 Total Rooms: ${totalRooms}\n` +
      `💳 Total Deposits: ${totalDeposits}\n`;

    ctx.reply(message);
  } catch (error) {
    console.error('Error fetching stats:', error);
    ctx.reply('Error fetching statistics.');
  }
});

bot.hears('Back', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('Unauthorized');
  }

  ctx.session = {};
  ctx.reply('Welcome back!', Markup.removeKeyboard());
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
    const transactionsRef = ref(db, 'transactions');
    const newTransactionRef = push(transactionsRef);
    await set(newTransactionRef, {
      userId: userId,
      type: 'deposit',
      amount: receiptData.amount,
      method: receiptData.method,
      status: 'completed',
      details: receiptData,
      createdAt: Date.now(),
      completedAt: Date.now()
    });

    // Update user balance
    const userRef = ref(db, `users/${userId}`);
    const userSnapshot = await get(userRef);
    const currentBalance = userSnapshot.val()?.balance || 0;
    const newBalance = currentBalance + receiptData.amount;
    await update(userRef, {
      balance: newBalance
    });

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
    const userRef = ref(db, `users/${userId}`);
    const userSnapshot = await get(userRef);
    const userData = userSnapshot.val();
    const balance = userData?.balance || 0;
    
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
    const withdrawalRequestsRef = ref(db, 'withdrawal_requests');
    const newWithdrawalRef = push(withdrawalRequestsRef);
    const withdrawalKey = newWithdrawalRef.key;
    await set(newWithdrawalRef, {
      userId: userId,
      username: ctx.from.username || '',
      amount: amount,
      accountType: accountDetails.includes('@') || accountDetails.length > 10 ? 'bank' : 'telebirr',
      accountDetails: accountDetails,
      status: 'pending',
      requestedAt: Date.now()
    });

    // Lock funds (reduce balance)
    const userRef = ref(db, `users/${userId}`);
    const userSnapshot = await get(userRef);
    const currentBalance = userSnapshot.val()?.balance || 0;
    await update(userRef, {
      balance: currentBalance - amount
    });

    ctx.reply(getText(lang, 'withdrawalRequested'));

    // Notify admins
    for (const adminId of ADMIN_IDS) {
      try {
        bot.telegram.sendMessage(
          adminId,
          `New withdrawal request:\nUser: @${ctx.from.username}\nAmount: ${amount} Birr\nAccount: ${accountDetails}`,
          Markup.inlineKeyboard([
            Markup.button.callback('✅ Approve', `approve_${withdrawalKey}`),
            Markup.button.callback('❌ Reject', `reject_${withdrawalKey}`)
          ])
        );
      } catch (error) {
        console.log('Error notifying admin:', error);
      }
    }

    ctx.session = {};
    return;
  }

  // Handle room creation
  if (ctx.session.step === 'create_room_name') {
    const roomName = ctx.message.text;
    
    try {
      const roomsRef = ref(db, 'rooms');
      const newRoomRef = push(roomsRef);
      const roomId = newRoomRef.key;
      
      await set(newRoomRef, {
        name: roomName,
        status: 'active',
        betAmount: 50, // Default bet amount
        maxPlayers: 20, // Default max players
        players: {},
        createdAt: Date.now(),
        createdBy: ctx.from.id.toString()
      });

      ctx.reply(`✅ Room "${roomName}" created successfully!\nRoom ID: ${roomId}`);
      ctx.session = {};
    } catch (error) {
      console.error('Error creating room:', error);
      ctx.reply('❌ Error creating room. Please try again.');
      ctx.session = {};
    }
    return;
  }

  // Handle user balance check
  if (ctx.session.step === 'check_user_balance') {
    const userInput = ctx.message.text;
    
    try {
      let userData = null;
      
      // Try to find user by username or ID
      const usersRef = ref(db, 'users');
      const snapshot = await get(usersRef);
      const users = snapshot.val() || {};
      
      // Check if input is a username (without @)
      if (userInput.startsWith('@')) {
        const username = userInput.substring(1);
        userData = Object.values(users).find(user => user.username === username);
      } else {
        // Check if input is a user ID
        userData = users[userInput];
      }

      if (userData) {
        const balance = userData.balance || 0;
        ctx.reply(`👤 User: @${userData.username || 'Unknown'}\n💳 Balance: ${balance.toLocaleString()} Birr`);
      } else {
        ctx.reply('❌ User not found. Please check the username or ID.');
      }
      
      ctx.session = {};
    } catch (error) {
      console.error('Error checking user balance:', error);
      ctx.reply('❌ Error checking user balance.');
      ctx.session = {};
    }
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
    const requestRef = ref(db, `withdrawal_requests/${requestId}`);
    const requestSnapshot = await get(requestRef);
    const requestData = requestSnapshot.val();
    
    if (!requestData) {
      return ctx.answerCbQuery('Request not found');
    }
    
    if (action === 'approve') {
      await update(requestRef, {
        status: 'completed',
        processedAt: Date.now(),
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
      await update(requestRef, {
        status: 'cancelled',
        processedAt: Date.now(),
        processedBy: ctx.from.id.toString()
      });

      // Return funds to user
      const userRef = ref(db, `users/${requestData.userId}`);
      const userSnapshot = await get(userRef);
      const currentBalance = userSnapshot.val()?.balance || 0;
      await update(userRef, {
        balance: currentBalance + requestData.amount
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

// Export bot for serverless function
export default bot;

// Start bot if running directly (not as serverless function)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  console.log('Starting Friday Bingo Bot...');
  bot.launch();

  // Graceful stop
  process.once('SIGINT', () => {
    try {
      bot.stop('SIGINT');
    } catch (error) {
      console.log('Bot already stopped');
    }
  });
  process.once('SIGTERM', () => {
    try {
      bot.stop('SIGTERM');
    } catch (error) {
      console.log('Bot already stopped');
    }
  });
}