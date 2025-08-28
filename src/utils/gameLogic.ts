import { BingoCard } from '../types';

export const generateBingoCards = (roomId: string, count: number = 100): BingoCard[] => {
  const cards: BingoCard[] = [];
  
  for (let i = 1; i <= count; i++) {
    const card: BingoCard = {
      id: `${roomId}-card-${i}`,
      serialNumber: i,
      numbers: {
        B: generateColumnNumbers(1, 15, 5),
        I: generateColumnNumbers(16, 30, 5),
        N: generateColumnNumbers(31, 45, 4), // N column has 4 numbers (center is free)
        G: generateColumnNumbers(46, 60, 5),
        O: generateColumnNumbers(61, 75, 5)
      },
      roomId,
      isAvailable: true
    };
    cards.push(card);
  }
  
  return cards;
};

const generateColumnNumbers = (min: number, max: number, count: number): number[] => {
  const numbers: number[] = [];
  const available = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * available.length);
    numbers.push(available.splice(randomIndex, 1)[0]);
  }
  
  return numbers.sort((a, b) => a - b);
};

export const generateDrawnNumbers = (count: number = 25): number[] => {
  const numbers: number[] = [];
  const available = Array.from({ length: 75 }, (_, i) => i + 1);
  
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * available.length);
    numbers.push(available.splice(randomIndex, 1)[0]);
  }
  
  return numbers;
};

export const checkBingo = (card: BingoCard, markedNumbers: number[]): boolean => {
  const cardNumbers = [
    ...card.numbers.B,
    ...card.numbers.I,
    ...card.numbers.N,
    ...card.numbers.G,
    ...card.numbers.O
  ];
  
  // Create 5x5 grid
  const grid: (number | null)[][] = [
    card.numbers.B,
    card.numbers.I,
    [...card.numbers.N.slice(0, 2), null, ...card.numbers.N.slice(2)], // Free space in center
    card.numbers.G,
    card.numbers.O
  ];
  
  // Check if marked numbers are valid for this card
  const validMarkedNumbers = markedNumbers.filter(num => 
    cardNumbers.includes(num) || num === 0 // 0 represents free space
  );
  
  // Add free space (center) to marked numbers
  validMarkedNumbers.push(0);
  
  // Check rows
  for (let row = 0; row < 5; row++) {
    let rowComplete = true;
    for (let col = 0; col < 5; col++) {
      const cellValue = grid[col][row];
      if (cellValue !== null && !validMarkedNumbers.includes(cellValue)) {
        rowComplete = false;
        break;
      }
    }
    if (rowComplete) return true;
  }
  
  // Check columns
  for (let col = 0; col < 5; col++) {
    let colComplete = true;
    for (let row = 0; row < 5; row++) {
      const cellValue = grid[col][row];
      if (cellValue !== null && !validMarkedNumbers.includes(cellValue)) {
        colComplete = false;
        break;
      }
    }
    if (colComplete) return true;
  }
  
  // Check diagonals
  let diagonal1Complete = true;
  let diagonal2Complete = true;
  
  for (let i = 0; i < 5; i++) {
    const cellValue1 = grid[i][i];
    const cellValue2 = grid[i][4 - i];
    
    if (cellValue1 !== null && !validMarkedNumbers.includes(cellValue1)) {
      diagonal1Complete = false;
    }
    
    if (cellValue2 !== null && !validMarkedNumbers.includes(cellValue2)) {
      diagonal2Complete = false;
    }
  }
  
  return diagonal1Complete || diagonal2Complete;
};

export const getNumberColumn = (number: number): string => {
  if (number >= 1 && number <= 15) return 'B';
  if (number >= 16 && number <= 30) return 'I';
  if (number >= 31 && number <= 45) return 'N';
  if (number >= 46 && number <= 60) return 'G';
  if (number >= 61 && number <= 75) return 'O';
  return '';
};