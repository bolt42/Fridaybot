import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-app.vercel.app';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();

app.use(cors());
app.use(express.json());

// In-memory storage (replace with Firebase in production)
const users = new Map();
const rooms = new Map();
const transactions = new Map();
const withdrawalRequests = new Map();

// Initialize demo room
rooms.set('demo-room', {
  id: 'demo-room',
  name: 'Demo Room',
  betAmount: 0,
  maxPlayers: 20,
  currentPlayers: 0,
  gameStatus: 'waiting',
  isDemoRoom: true,
  createdBy: 'system'
});

// Bot Commands
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeText = `
🎯 Welcome to Friday Bingo! 🎯

Available commands:
/playgame - Launch the bingo mini app
/deposit - Add funds to your account (Amharic)
/withdraw - Withdraw your winnings (Amharic)

Let's play some bingo! 🎊
  `;
  
  bot.sendMessage(chatId, welcomeText);
});

bot.onText(/\/playgame/, (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  
  // Register user if new
  if (!users.has(user.id)) {
    users.set(user.id, {
      id: user.id,
      username: user.username || `user_${user.id}`,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      balance: 50,
      createdAt: new Date()
    });
  }
  
  const keyboard = {
    inline_keyboard: [[
      {
        text: '🎮 Play Friday Bingo',
        web_app: { url: WEBAPP_URL }
      }
    ]]
  };
  
  bot.sendMessage(chatId, '🎯 Ready to play Friday Bingo? Tap the button below!', {
    reply_markup: keyboard
  });
});

bot.onText(/\/deposit/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!users.has(userId)) {
    bot.sendMessage(chatId, 'እባክዎ በመጀመሪያ /playgame ይተይቡ።');
    return;
  }
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '📱 CBE Mobile Banking', callback_data: 'deposit_cbe' }],
      [{ text: '💳 Telebirr', callback_data: 'deposit_telebirr' }]
    ]
  };
  
  bot.sendMessage(chatId, 'የክፍያ መንገዱን ይምረጡ:', { reply_markup: keyboard });
});

bot.onText(/\/withdraw/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!users.has(userId)) {
    bot.sendMessage(chatId, 'እባክዎ በመጀመሪያ /playgame ይተይቡ።');
    return;
  }
  
  const user = users.get(userId);
  bot.sendMessage(chatId, 
    `💰 የአሁን ሂሳብዎ: ${user.balance} ብር\n\n` +
    'የሚወጣውን መጠን ይላኩ (ምሳሌ: 100):'
  );
  
  bot.once('message', (amountMsg) => {
    const amount = parseFloat(amountMsg.text);
    
    if (isNaN(amount) || amount <= 0) {
      bot.sendMessage(chatId, '❌ ትክክለኛ መጠን ያስገቡ።');
      return;
    }
    
    if (amount > user.balance) {
      bot.sendMessage(chatId, '❌ በቂ ሂሳብ የለዎትም።');
      return;
    }
    
    bot.sendMessage(chatId, 'የመውጫ አካውንት መረጃ ይላኩ (የባንክ ሂሳብ ወይም የቴሌብር ቁጥር):');
    
    bot.once('message', (accountMsg) => {
      const account = accountMsg.text;
      const requestId = `${userId}_${Date.now()}`;
      
      withdrawalRequests.set(requestId, {
        id: requestId,
        userId,
        amount,
        account,
        status: 'pending',
        createdAt: new Date()
      });
      
      // Lock the funds
      user.balance -= amount;
      users.set(userId, user);
      
      bot.sendMessage(chatId, 
        '⏳ የማውጫ ጥያቄዎ ተቀበለ። እባክዎ ይጠብቁ፣ ግብይቱ በማስኬድ ላይ ነው።'
      );
      
      // Notify admins
      ADMIN_IDS.forEach(adminId => {
        if (adminId) {
          const keyboard = {
            inline_keyboard: [[
              { text: '✅ ክፍያ ተፈጸመ', callback_data: `complete_withdrawal_${requestId}` }
            ]]
          };
          
          bot.sendMessage(adminId, 
            `💰 የማውጫ ጥያቄ:\n\n` +
            `👤 ተጠቃሚ: @${user.username}\n` +
            `💵 መጠን: ${amount} ብር\n` +
            `🏦 አካውንት: ${account}\n` +
            `🕐 ጊዜ: ${new Date().toLocaleString()}`,
            { reply_markup: keyboard }
          );
        }
      });
    });
  });
});

// Handle callback queries
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  if (data === 'deposit_cbe') {
    bot.sendMessage(chatId, 
      '📱 CBE Mobile Banking SMS ደረሰኞን ይላኩ:\n\n' +
      'ምሳሌ: "CBE: Transaction successful. Amount: 100.00 ETB. Ref: TXN123456789. Balance: 500.00 ETB. Time: 15:30 12/01/2024"'
    );
    
    bot.once('message', async (smsMsg) => {
      const smsText = smsMsg.text;
      const transactionDetails = await parseCBESMS(smsText);
      
      if (transactionDetails) {
        await processDeposit(userId, transactionDetails, chatId);
      } else {
        bot.sendMessage(chatId, '❌ ትክክለኛ CBE SMS ያስገቡ።');
      }
    });
  } else if (data === 'deposit_telebirr') {
    bot.sendMessage(chatId, 
      '💳 Telebirr SMS ደረሰኞን ወይም የድር አገናኙን ይላኩ:\n\n' +
      'ምሳሌ: "https://telebirr.com/receipt/ABC123" ወይም SMS ደረሰኝ'
    );
    
    bot.once('message', async (receiptMsg) => {
      const receiptText = receiptMsg.text;
      let transactionDetails;
      
      if (receiptText.startsWith('http')) {
        transactionDetails = await scrapeTelebirrReceipt(receiptText);
      } else {
        transactionDetails = await parseTelebirrSMS(receiptText);
      }
      
      if (transactionDetails) {
        await processDeposit(userId, transactionDetails, chatId);
      } else {
        bot.sendMessage(chatId, '❌ ትክክለኛ Telebirr ደረሰኝ ያስገቡ።');
      }
    });
  } else if (data.startsWith('complete_withdrawal_')) {
    const requestId = data.replace('complete_withdrawal_', '');
    const request = withdrawalRequests.get(requestId);
    
    if (request && request.status === 'pending') {
      request.status = 'completed';
      withdrawalRequests.set(requestId, request);
      
      // Notify user
      bot.sendMessage(request.userId, 
        `✅ የማውጫ ጥያቄዎ ተፈጽሟል!\n\n` +
        `💵 መጠን: ${request.amount} ብር\n` +
        `🏦 አካውንት: ${request.account}`
      );
      
      // Notify admin
      bot.sendMessage(chatId, `✅ የማውጫ ጥያቄ ${requestId} ተፈጽሟል።`);
    }
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

// Admin Commands
bot.onText(/\/admin_create_room/, (msg) => {
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) {
    bot.sendMessage(msg.chat.id, '❌ You are not authorized.');
    return;
  }
  
  bot.sendMessage(msg.chat.id, 'Send room details in format:\nRoomName,BetAmount,MaxPlayers');
  
  bot.once('message', (roomMsg) => {
    const [name, betAmount, maxPlayers] = roomMsg.text.split(',');
    
    if (name && betAmount && maxPlayers) {
      const roomId = `room_${Date.now()}`;
      rooms.set(roomId, {
        id: roomId,
        name: name.trim(),
        betAmount: parseFloat(betAmount.trim()),
        maxPlayers: parseInt(maxPlayers.trim()),
        currentPlayers: 0,
        gameStatus: 'waiting',
        isDemoRoom: false,
        createdBy: userId
      });
      
      bot.sendMessage(msg.chat.id, `✅ Room "${name}" created successfully!`);
    } else {
      bot.sendMessage(msg.chat.id, '❌ Invalid format. Try again.');
    }
  });
});

bot.onText(/\/admin_balance (.+) (.+)/, (msg, match) => {
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) {
    bot.sendMessage(msg.chat.id, '❌ You are not authorized.');
    return;
  }
  
  const username = match[1];
  const amount = parseFloat(match[2]);
  
  // Find user by username
  const targetUser = Array.from(users.values()).find(u => u.username === username);
  
  if (targetUser) {
    targetUser.balance += amount;
    users.set(targetUser.id, targetUser);
    
    bot.sendMessage(msg.chat.id, 
      `✅ Balance updated for @${username}:\n` +
      `New balance: ${targetUser.balance} ETB`
    );
    
    // Notify user
    bot.sendMessage(targetUser.id, 
      `💰 Your balance has been updated!\n` +
      `Change: ${amount > 0 ? '+' : ''}${amount} ETB\n` +
      `New balance: ${targetUser.balance} ETB`
    );
  } else {
    bot.sendMessage(msg.chat.id, `❌ User @${username} not found.`);
  }
});

// Utility Functions
async function parseCBESMS(smsText) {
  const amountMatch = smsText.match(/Amount:\s*(\d+\.?\d*)/i);
  const refMatch = smsText.match(/Ref:\s*(\w+)/i);
  
  if (amountMatch && refMatch) {
    const transactionId = refMatch[1];
    
    // Check if transaction already exists
    if (transactions.has(transactionId)) {
      return null;
    }
    
    return {
      amount: parseFloat(amountMatch[1]),
      transactionId,
      method: 'CBE',
      timestamp: new Date()
    };
  }
  
  return null;
}

async function parseTelebirrSMS(smsText) {
  const amountMatch = smsText.match(/(\d+\.?\d*)\s*ETB/i);
  const refMatch = smsText.match(/(TXN\w+|REF\w+|\w{8,})/i);
  
  if (amountMatch && refMatch) {
    const transactionId = refMatch[1];
    
    // Check if transaction already exists
    if (transactions.has(transactionId)) {
      return null;
    }
    
    return {
      amount: parseFloat(amountMatch[1]),
      transactionId,
      method: 'Telebirr',
      timestamp: new Date()
    };
  }
  
  return null;
}

async function scrapeTelebirrReceipt(url) {
  try {
    // This would use cheerio to scrape the receipt page
    // For demo, we'll simulate the response
    const mockTransactionId = `WEB_${Date.now()}`;
    const mockAmount = 100; // This would be scraped from the page
    
    if (transactions.has(mockTransactionId)) {
      return null;
    }
    
    return {
      amount: mockAmount,
      transactionId: mockTransactionId,
      method: 'Telebirr Web',
      timestamp: new Date()
    };
  } catch (error) {
    console.error('Error scraping receipt:', error);
    return null;
  }
}

async function processDeposit(userId, transactionDetails, chatId) {
  const user = users.get(userId);
  
  if (!user) {
    bot.sendMessage(chatId, '❌ ተጠቃሚ አልተገኘም።');
    return;
  }
  
  // Save transaction
  transactions.set(transactionDetails.transactionId, {
    ...transactionDetails,
    userId,
    status: 'completed'
  });
  
  // Update user balance
  user.balance += transactionDetails.amount;
  users.set(userId, user);
  
  bot.sendMessage(chatId, 
    `✅ ክፍያዎ በተሳካ ሁኔታ ተቀብሏል!\n\n` +
    `💵 የገባ መጠን: ${transactionDetails.amount} ብር\n` +
    `🏦 የክፍያ መንገድ: ${transactionDetails.method}\n` +
    `💰 አዲስ ሂሳብ: ${user.balance} ብር\n` +
    `📱 የግብይት ቁጥር: ${transactionDetails.transactionId}`
  );
}

// API Endpoints for React App
app.get('/api/user/:id', (req, res) => {
  const user = users.get(parseInt(req.params.id));
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.get('/api/rooms', (req, res) => {
  res.json(Array.from(rooms.values()));
});

app.post('/api/rooms/:id/join', (req, res) => {
  const room = rooms.get(req.params.id);
  if (room) {
    room.currentPlayers = Math.min(room.currentPlayers + 1, room.maxPlayers);
    rooms.set(room.id, room);
    res.json(room);
  } else {
    res.status(404).json({ error: 'Room not found' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🤖 Bot server running on port ${PORT}`);
  console.log(`🎯 Friday Bingo Bot is ready!`);
});

export default bot;