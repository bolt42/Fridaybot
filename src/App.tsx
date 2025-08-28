import React, { useState, useEffect } from 'react';
import { AppProvider } from './contexts/AppContext';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import GameBoard from './components/GameBoard';
import { Room, Game, BingoCard } from './types';
import { generateBingoCards } from './utils/gameLogic';

function App() {
  const [currentView, setCurrentView] = useState<'home' | 'game'>('home');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [availableCards, setAvailableCards] = useState<BingoCard[]>([]);

  // Mock data for development
  useEffect(() => {
    const mockRooms: Room[] = [
      {
        id: 'demo-room',
        name: 'Demo Room',
        betAmount: 0,
        maxPlayers: 10,
        isActive: true,
        isDemo: true,
        createdAt: new Date(),
        createdBy: 'system'
      },
      {
        id: 'room-1',
        name: 'Friday Night Special',
        betAmount: 50,
        maxPlayers: 20,
        isActive: true,
        isDemo: false,
        createdAt: new Date(),
        createdBy: 'admin'
      },
      {
        id: 'room-2',
        name: 'High Stakes Bingo',
        betAmount: 100,
        maxPlayers: 15,
        isActive: true,
        isDemo: false,
        createdAt: new Date(),
        createdBy: 'admin'
      }
    ];

    // Mock available rooms in localStorage for demo
    localStorage.setItem('mockRooms', JSON.stringify(mockRooms));
  }, []);

  const handleJoinRoom = (roomId: string) => {
    const mockRooms = JSON.parse(localStorage.getItem('mockRooms') || '[]');
    const room = mockRooms.find((r: Room) => r.id === roomId);
    
    if (room) {
      setSelectedRoom(room);
      const cards = generateBingoCards(roomId);
      setAvailableCards(cards);
      setCurrentView('game');
      
      // Mock game state
      const mockGame: Game = {
        id: `game-${roomId}-${Date.now()}`,
        roomId: roomId,
        status: 'waiting',
        players: [],
        drawnNumbers: [],
        totalPot: 0
      };
      setCurrentGame(mockGame);
    }
  };

  const handleBackToHome = () => {
    setCurrentView('home');
    setSelectedRoom(null);
    setCurrentGame(null);
    setAvailableCards([]);
  };

  const handleSelectCard = (cardId: string) => {
    console.log('Selected card:', cardId);
    // TODO: Implement card selection logic
  };

  const handleMarkNumber = (number: number) => {
    console.log('Marked number:', number);
    // TODO: Implement number marking logic
  };

  const handleCallBingo = () => {
    console.log('Player called BINGO!');
    // TODO: Implement bingo validation logic
  };

  return (
    <AppProvider>
      <div className="min-h-screen bg-gray-50">
        <Header />
        
        {currentView === 'home' && (
          <HomePage onJoinRoom={handleJoinRoom} />
        )}
        
        {currentView === 'game' && selectedRoom && (
          <GameBoard
            room={selectedRoom}
            game={currentGame}
            availableCards={availableCards}
            onBack={handleBackToHome}
            onSelectCard={handleSelectCard}
            onMarkNumber={handleMarkNumber}
            onCallBingo={handleCallBingo}
          />
        )}
      </div>
    </AppProvider>
  );
}

export default App;