import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { ServerMessage, Ship } from '@game-zero/shared';
import { SERVER_PORT } from '@game-zero/shared';
import { JoinScreen } from './components/JoinScreen';
import { Controller } from './components/Controller';

type AppState = 'join' | 'waiting' | 'playing';

export default function App() {
  const [appState, setAppState] = useState<AppState>('join');
  const [roomCode, setRoomCode] = useState<string>('');
  const [myShip, setMyShip] = useState<Ship | null>(null);
  const [error, setError] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);

  // Check URL params for room code and server
  const [serverAddress, setServerAddress] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const server = params.get('server');

    if (room) {
      setRoomCode(room.toUpperCase());
    }

    // Server can be passed as URL param (for cloud-hosted controller)
    // Format: ?server=192.168.1.50:3000 or ?server=192.168.1.50 (defaults to port 3000)
    if (server) {
      const serverWithPort = server.includes(':') ? server : `${server}:3000`;
      setServerAddress(serverWithPort);
    }
  }, []);

  const connect = useCallback((room: string, name: string) => {
    // Use server from URL param, or fall back to same host as controller
    const wsHost = serverAddress || `${window.location.hostname || 'localhost'}:${SERVER_PORT}`;
    const wsUrl = `ws://${wsHost}`;
    console.log('Connecting to', wsUrl);

    // Check if we have a server address when on HTTPS
    if (window.location.protocol === 'https:' && !serverAddress) {
      setError('Server address required. Please scan QR code from the game display.');
      return;
    }

    // Note: HTTPS pages connecting to ws:// may be blocked by browsers (mixed content)
    // This works when the server is on a private/local IP in most browsers
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected, joining room', room);
      ws.send(JSON.stringify({
        type: 'join_room',
        roomCode: room,
        playerName: name,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'room_update':
            if (message.room?.phase === 'lobby') {
              setAppState('waiting');
            } else if (message.room?.phase === 'playing') {
              setAppState('playing');
            }
            break;
          case 'game_state':
            if (message.yourShipId) {
              const ship = message.state.ships.find(s => s.id === message.yourShipId);
              if (ship) setMyShip(ship);
            }
            break;
          case 'error':
            setError(message.message);
            setAppState('join');
            break;
        }
      } catch (e) {
        console.error('Message handling error:', e);
      }
    };

    ws.onclose = () => {
      console.log('Disconnected');
      setAppState('join');
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      if (window.location.protocol === 'https:') {
        setError('Connection failed. Make sure the game server is running and you\'re on the same WiFi network.');
      } else {
        setError('Could not connect to server. Is the game running?');
      }
    };

    setRoomCode(room);
  }, [serverAddress]);

  const sendInput = useCallback((rotation: number, thrust: boolean, fire: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'player_input',
        input: {
          sequenceNumber: Date.now(),
          rotation,
          thrust,
          fire,
          timestamp: Date.now(),
        },
      }));
    }
  }, []);

  // Render based on state
  if (appState === 'join') {
    return (
      <JoinScreen
        initialRoomCode={roomCode}
        error={error}
        onJoin={connect}
      />
    );
  }

  if (appState === 'waiting') {
    return (
      <div style={waitingStyle}>
        <h1 style={{ color: '#4ECDC4', marginBottom: '1rem' }}>READY!</h1>
        <p style={{ color: '#888' }}>Room: <span style={{ color: '#FFE66D' }}>{roomCode}</span></p>
        <p style={{ color: '#888', marginTop: '0.5rem' }}>Waiting for host to start game...</p>
        <p style={{ color: '#555', marginTop: '1rem', fontSize: '0.8rem' }}>Press START GAME on the TV</p>
        <div style={pulseStyle} />
      </div>
    );
  }

  return <Controller ship={myShip} onInput={sendInput} />;
}

const waitingStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  minHeight: '-webkit-fill-available',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0a0a12',
  color: 'white',
  position: 'fixed',
  top: 0,
  left: 0,
};

const pulseStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: '50%',
  backgroundColor: '#4ECDC4',
  marginTop: '2rem',
  animation: 'pulse 1.5s infinite',
};

// Add keyframes via style tag
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.5); opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);
}
