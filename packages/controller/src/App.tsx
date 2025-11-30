import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { ServerMessage, Ship, GameMode } from '@game-zero/shared';
import { SERVER_PORT, GAME_MODE_NAMES, GAME_MODE_DESCRIPTIONS } from '@game-zero/shared';
import { JoinScreen } from './components/JoinScreen';
import { Controller } from './components/Controller';

type AppState = 'join' | 'waiting' | 'playing';

export default function App() {
  const [appState, setAppState] = useState<AppState>('join');
  const [roomCode, setRoomCode] = useState<string>('');
  const [myShip, setMyShip] = useState<Ship | null>(null);
  const [error, setError] = useState<string>('');
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [isLeader, setIsLeader] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>('ffa');

  const wsRef = useRef<WebSocket | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const leaderIdRef = useRef<string | null>(null);

  // Recalculate isLeader whenever playerId or leaderId changes
  useEffect(() => {
    const amLeader = !!(playerId && leaderId && playerId === leaderId);
    console.log('[LEADER CHECK] playerId:', playerId, 'leaderId:', leaderId, 'isLeader:', amLeader);
    setIsLeader(amLeader);
  }, [playerId, leaderId]);

  // Debug logger that shows on UI
  const log = useCallback((msg: string) => {
    console.log('[DEBUG]', msg);
    setDebugLog(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${msg}`]);
  }, []);

  // Check URL params for room code and server
  const [serverAddress, setServerAddress] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const server = params.get('server');

    log(`URL: ${window.location.href}`);
    log(`Protocol: ${window.location.protocol}`);
    log(`Room param: ${room || '(none)'}`);
    log(`Server param: ${server || '(none)'}`);

    if (room) {
      setRoomCode(room.toUpperCase());
    }

    // Server can be passed as URL param (for cloud-hosted controller)
    // Format: ?server=192.168.1.50:3000 or ?server=192.168.1.50 (defaults to port 3000)
    // Exception: Cloudflare tunnels don't need a port (they use HTTPS 443)
    if (server) {
      const isTunnel = server.includes('trycloudflare.com') || server.includes('cloudflare');
      const serverWithPort = isTunnel ? server : (server.includes(':') ? server : `${server}:3000`);
      setServerAddress(serverWithPort);
      log(`Server address set: ${serverWithPort} (tunnel: ${isTunnel})`);
    }
  }, [log]);

  const connect = useCallback((room: string, name: string) => {
    log(`Connect called: room=${room}, name=${name}`);
    log(`serverAddress state: ${serverAddress || '(null)'}`);

    // Use server from URL param, or fall back to same host as controller
    const wsHost = serverAddress || `${window.location.hostname || 'localhost'}:${SERVER_PORT}`;

    // Use WSS for Cloudflare tunnels and other HTTPS endpoints, WS for local
    const isSecureEndpoint = wsHost.includes('trycloudflare.com') ||
                             wsHost.includes('cloudflare') ||
                             window.location.protocol === 'https:';
    const wsProtocol = isSecureEndpoint ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${wsHost}`;
    log(`WebSocket URL: ${wsUrl} (secure: ${isSecureEndpoint})`);

    // Check if we have a server address when on HTTPS
    if (window.location.protocol === 'https:' && !serverAddress) {
      const err = 'Server address required. Please scan QR code from the game display.';
      log(`ERROR: ${err}`);
      setError(err);
      return;
    }

    log('Creating WebSocket...');
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      log('WebSocket created, waiting for connection...');

      ws.onopen = () => {
        log('WebSocket OPEN - sending join_room');
        ws.send(JSON.stringify({
          type: 'join_room',
          roomCode: room,
          playerName: name,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          log(`Message received: ${message.type}`);

          switch (message.type) {
            case 'joined':
              log(`Joined with ID: ${message.playerId}`);
              playerIdRef.current = message.playerId;
              setPlayerId(message.playerId);
              break;
            case 'room_update':
              if (message.room?.phase === 'lobby') {
                log('Room phase: lobby -> waiting');
                setAppState('waiting');
              } else if (message.room?.phase === 'playing') {
                log('Room phase: playing');
                setAppState('playing');
              }
              // Track leaderId - the useEffect will calculate isLeader
              if (message.room) {
                const roomLeaderId = message.room.leaderId;
                log(`Room update: leaderId=${roomLeaderId}, myId=${playerIdRef.current}, mode=${message.room.gameMode}`);
                leaderIdRef.current = roomLeaderId;
                setLeaderId(roomLeaderId);
                // Track game mode
                if (message.room.gameMode) {
                  setGameMode(message.room.gameMode);
                }
              }
              break;
            case 'game_state':
              if (message.yourShipId) {
                const ship = message.state.ships.find(s => s.id === message.yourShipId);
                if (ship) setMyShip(ship);
              }
              break;
            case 'error':
              log(`Server error: ${message.message}`);
              setError(message.message);
              setAppState('join');
              break;
          }
        } catch (e) {
          log(`Message parse error: ${e}`);
        }
      };

      ws.onclose = (event) => {
        log(`WebSocket CLOSED: code=${event.code}, reason=${event.reason || '(none)'}`);
        setAppState('join');
      };

      ws.onerror = (err) => {
        log(`WebSocket ERROR: ${err.type}`);
        if (window.location.protocol === 'https:') {
          setError('Connection failed. Make sure the game server is running and you\'re on the same WiFi network.');
        } else {
          setError('Could not connect to server. Is the game running?');
        }
      };
    } catch (e) {
      log(`WebSocket creation failed: ${e}`);
      setError(`Failed to create connection: ${e}`);
    }

    setRoomCode(room);
  }, [serverAddress, log]);

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

  const startGame = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      log('Sending start_game');
      wsRef.current.send(JSON.stringify({ type: 'start_game' }));
    }
  }, [log]);

  const changeGameMode = useCallback((mode: GameMode) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      log(`Sending set_game_mode: ${mode}`);
      wsRef.current.send(JSON.stringify({ type: 'set_game_mode', gameMode: mode }));
    }
  }, [log]);

  // Render based on state
  if (appState === 'join') {
    return (
      <JoinScreen
        initialRoomCode={roomCode}
        error={error}
        onJoin={connect}
        debugLog={debugLog}
      />
    );
  }

  if (appState === 'waiting') {
    const gameModes: GameMode[] = ['ffa', 'asteroid_hunters', 'knockout'];

    return (
      <div style={waitingStyle}>
        <h1 style={{ color: '#4ECDC4', marginBottom: '1rem' }}>READY!</h1>
        <p style={{ color: '#888' }}>Room: <span style={{ color: '#FFE66D' }}>{roomCode}</span></p>

        {/* Current game mode display */}
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <p style={{ color: '#888', fontSize: '0.9rem', margin: 0 }}>Game Mode:</p>
          <p style={{ color: '#4ECDC4', fontSize: '1.2rem', fontWeight: 'bold', margin: '0.25rem 0' }}>
            {GAME_MODE_NAMES[gameMode]}
          </p>
          <p style={{ color: '#666', fontSize: '0.75rem', margin: 0 }}>
            {GAME_MODE_DESCRIPTIONS[gameMode]}
          </p>
        </div>

        {isLeader ? (
          <>
            <p style={{ color: '#FFE66D', marginTop: '1rem' }}>You are the Leader!</p>

            {/* Game mode selector */}
            <div style={modeSelectorContainer}>
              {gameModes.map((mode) => (
                <button
                  key={mode}
                  style={{
                    ...modeButtonStyle,
                    backgroundColor: gameMode === mode ? '#4ECDC4' : 'transparent',
                    color: gameMode === mode ? '#0a0a12' : '#4ECDC4',
                    borderColor: '#4ECDC4',
                  }}
                  onClick={() => changeGameMode(mode)}
                >
                  {GAME_MODE_NAMES[mode]}
                </button>
              ))}
            </div>

            <button style={startButtonStyle} onClick={startGame}>
              START GAME
            </button>
          </>
        ) : (
          <>
            <p style={{ color: '#888', marginTop: '0.5rem' }}>Waiting for leader to start game...</p>
            <div style={pulseStyle} />
          </>
        )}
        {/* Debug info */}
        <div style={{ position: 'fixed', bottom: 10, left: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.8)', padding: 8, borderRadius: 4, fontSize: '0.6rem', color: '#888' }}>
          <p style={{ margin: 0, color: '#FF6B6B' }}>DEBUG: playerId={playerId || 'null'}, leaderId={leaderId || 'null'}, isLeader={String(isLeader)}</p>
          {debugLog.slice(-5).map((line, i) => (
            <p key={i} style={{ margin: 0 }}>{line}</p>
          ))}
        </div>
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

const startButtonStyle: React.CSSProperties = {
  marginTop: '1.5rem',
  padding: '1.5rem 3rem',
  fontSize: '1.5rem',
  fontWeight: 'bold',
  color: '#0a0a12',
  backgroundColor: '#4ECDC4',
  border: 'none',
  borderRadius: '12px',
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '2px',
};

const modeSelectorContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  marginTop: '1rem',
  width: '100%',
  maxWidth: '280px',
};

const modeButtonStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  fontSize: '1rem',
  fontWeight: 'bold',
  border: '2px solid',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'all 0.2s',
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
