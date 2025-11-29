import React, { useState, useEffect } from 'react';

interface JoinScreenProps {
  initialRoomCode: string;
  error: string;
  onJoin: (roomCode: string, playerName: string) => void;
}

export function JoinScreen({ initialRoomCode, error, onJoin }: JoinScreenProps) {
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [playerName, setPlayerName] = useState('');

  // Sync with prop if it changes (e.g., from URL param loaded after mount)
  useEffect(() => {
    if (initialRoomCode && !roomCode) {
      setRoomCode(initialRoomCode);
    }
  }, [initialRoomCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.length === 4 && playerName.trim()) {
      onJoin(roomCode.toUpperCase(), playerName.trim());
    }
  };

  return (
    <div style={containerStyle}>
      <h1 style={{ color: '#4ECDC4', fontSize: '2rem', marginBottom: '2rem' }}>
        GAME-ZERO
      </h1>

      <form onSubmit={handleSubmit} style={formStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>ROOM CODE</label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="ABCD"
            maxLength={4}
            style={inputStyle}
            autoComplete="off"
            autoCapitalize="characters"
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>YOUR NAME</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value.slice(0, 12))}
            placeholder="Player"
            maxLength={12}
            style={inputStyle}
            autoComplete="off"
          />
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        <button
          type="submit"
          disabled={roomCode.length !== 4 || !playerName.trim()}
          style={{
            ...buttonStyle,
            opacity: roomCode.length === 4 && playerName.trim() ? 1 : 0.5,
          }}
        >
          JOIN GAME
        </button>
      </form>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0a0a12',
  padding: '2rem',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  width: '100%',
  maxWidth: '300px',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const labelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '0.9rem',
  letterSpacing: '0.1em',
};

const inputStyle: React.CSSProperties = {
  padding: '1rem',
  fontSize: '1.5rem',
  fontFamily: 'Courier New, monospace',
  textAlign: 'center',
  backgroundColor: '#1a1a2e',
  border: '2px solid #333',
  borderRadius: '8px',
  color: 'white',
  outline: 'none',
};

const buttonStyle: React.CSSProperties = {
  padding: '1rem',
  fontSize: '1.2rem',
  fontFamily: 'Courier New, monospace',
  fontWeight: 'bold',
  backgroundColor: '#4ECDC4',
  color: '#0a0a12',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  marginTop: '1rem',
};

const errorStyle: React.CSSProperties = {
  color: '#FF6B6B',
  textAlign: 'center',
  fontSize: '0.9rem',
};
