# Friday Bingo Telegram Mini App

A comprehensive Telegram bot with a React-based mini app for playing Bingo games with real money betting and payment processing.

## Features

### Telegram Bot
- `/playgame` - Launch the mini app
- `/deposit` - Deposit money via CBE Bank or Telebirr (Amharic only)
- `/withdraw` - Request money withdrawal with admin approval (Amharic only)
- `/balance` - Check current balance
- Admin commands for room management and user balance adjustments

### Mini App
- Bilingual interface (English/Amharic)
- Real-time gameplay with Firebase
- Demo room for free play
- Multiple betting rooms with different stakes
- Live bingo card generation and number marking
- Winner validation and automatic payouts
- Responsive design for all devices

### Game Logic
- 100 unique bingo cards per room (B-I-N-G-O format)
- Minimum 2 players to start a game
- 30-second countdown before game begins
- 25 random numbers drawn per game
- Winner verification with proper bingo pattern checking
- 90% payout to winner (10% house edge)

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Serverless functions on Vercel
- **Database**: Firebase Firestore
- **Bot**: Telegraf.js
- **Hosting**: Vercel
- **Real-time**: Firebase real-time listeners

## Setup Instructions

### 1. Prerequisites
- Node.js 18+
- Firebase project
- Telegram Bot Token
- Vercel account

### 2. Firebase Setup
1. Create a new Firebase project
2. Enable Firestore Database
3. Create a service account and download the JSON key
4. Copy Firebase config to environment variables

### 3. Telegram Bot Setup
1. Create a bot using @BotFather
2. Get your bot token
3. Add admin user IDs to environment variables

### 4. Environment Variables
Copy `.env.example` to `.env` and fill in the values:
```bash
cp .env.example .env
```

### 5. Install Dependencies
```bash
npm install
```

### 6. Development
```bash
# Start frontend
npm run dev

# Start bot (in another terminal)
npm run bot:dev
```

### 7. Deploy to Vercel
```bash
vercel --prod
```

## Database Schema

### Collections:
- `users` - User profiles and balances
- `rooms` - Game rooms configuration
- `games` - Active game states
- `bingo_cards` - Generated cards for each room
- `transactions` - Payment history
- `withdrawal_requests` - Pending withdrawals

## Payment Processing

### Deposit Flow:
1. User selects payment method (CBE/Telebirr)
2. User pastes SMS receipt
3. Bot parses transaction details
4. Validates unique transaction ID
5. Updates user balance automatically

### Withdrawal Flow:
1. User enters withdrawal amount
2. User provides account details
3. System locks funds from balance
4. Admin receives notification with approval buttons
5. Manual processing and user notification

## Game Rules

### Bingo Cards:
- B: 1-15 (5 numbers)
- I: 16-30 (5 numbers)  
- N: 31-45 (4 numbers + FREE space)
- G: 46-60 (5 numbers)
- O: 61-75 (5 numbers)

### Winning Patterns:
- Horizontal line (any row)
- Vertical line (any column)
- Diagonal line (either direction)

### Payout:
- Winner gets: (Total Players × Room Bet Amount × 0.9)
- House keeps 10% for operations

## Admin Features

### Room Management:
- Create/edit rooms
- Set bet amounts and player limits
- Activate/deactivate rooms
- View game statistics

### User Management:
- View user balances
- Add/subtract balance manually
- View transaction history
- Handle withdrawal approvals

## Mobile App Integration

The app is designed as a Telegram Mini App and works seamlessly within the Telegram interface on all devices.

### Key Features:
- Native Telegram authentication
- Responsive design for mobile/tablet/desktop
- Real-time updates during gameplay
- Offline-friendly caching

## Security Features

- Transaction ID validation prevents duplicate deposits
- Admin approval required for all withdrawals
- Balance validation before allowing bets
- Secure Firebase rules for data access
- Rate limiting on bot commands

## Support

Created by **BOLT4L**

For support and setup assistance, contact the development team.

## License

Private project - All rights reserved.