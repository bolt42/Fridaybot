import React from 'react';
import { BingoCard as BingoCardType } from '../types';

interface BingoCardProps {
  card: BingoCardType;
  markedNumbers: number[];
  drawnNumbers: number[];
  onNumberClick: (number: number) => void;
  isInteractive?: boolean;
}

const BingoCard: React.FC<BingoCardProps> = ({
  card,
  markedNumbers,
  drawnNumbers,
  onNumberClick,
  isInteractive = true
}) => {
  const renderCell = (number: number | null, columnIndex: number, rowIndex: number) => {
    const isCenter = columnIndex === 2 && rowIndex === 2;
    const isMarked = number ? markedNumbers.includes(number) : isCenter;
    const isDrawn = number ? drawnNumbers.includes(number) : false;
    const isClickable = isInteractive && number && isDrawn && !isMarked;

    return (
      <div
        key={`${columnIndex}-${rowIndex}`}
        className={`
          aspect-square flex items-center justify-center text-sm font-semibold border border-gray-300 transition-all duration-200
          ${isCenter ? 'bg-green-500 text-white' : ''}
          ${isMarked && !isCenter ? 'bg-blue-500 text-white' : ''}
          ${isDrawn && !isMarked && !isCenter ? 'bg-yellow-100 border-yellow-300' : ''}
          ${isClickable ? 'cursor-pointer hover:bg-blue-100' : ''}
          ${!isDrawn && !isCenter && !isMarked ? 'bg-gray-50' : ''}
        `}
        onClick={() => {
          if (isClickable && number) {
            onNumberClick(number);
          }
        }}
      >
        {isCenter ? 'FREE' : number}
      </div>
    );
  };

  const createGrid = () => {
    const grid: (number | null)[][] = [];
    
    // Create 5x5 grid
    for (let row = 0; row < 5; row++) {
      const gridRow: (number | null)[] = [];
      
      // B column
      gridRow.push(card.numbers.B[row] || null);
      // I column
      gridRow.push(card.numbers.I[row] || null);
      // N column (with free space in center)
      if (row === 2) {
        gridRow.push(null); // Free space
      } else {
        const nIndex = row < 2 ? row : row - 1;
        gridRow.push(card.numbers.N[nIndex] || null);
      }
      // G column
      gridRow.push(card.numbers.G[row] || null);
      // O column
      gridRow.push(card.numbers.O[row] || null);
      
      grid.push(gridRow);
    }
    
    return grid;
  };

  const grid = createGrid();
  const columns = ['B', 'I', 'N', 'G', 'O'];

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 max-w-sm mx-auto">
      <div className="mb-3 text-center">
        <h3 className="text-lg font-bold text-gray-800">Card #{card.serialNumber}</h3>
      </div>
      
      {/* Column Headers */}
      <div className="grid grid-cols-5 gap-1 mb-1">
        {columns.map((col, index) => (
          <div key={col} className="aspect-square flex items-center justify-center bg-red-600 text-white font-bold text-lg rounded">
            {col}
          </div>
        ))}
      </div>
      
      {/* Bingo Grid */}
      <div className="grid grid-cols-5 gap-1">
        {grid.map((row, rowIndex) =>
          row.map((number, colIndex) => 
            renderCell(number, colIndex, rowIndex)
          )
        )}
      </div>
    </div>
  );
};

export default BingoCard;