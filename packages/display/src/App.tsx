import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import QRCode from 'qrcode';
import type { ServerMessage, GameState, RoomInfo, Ship, Asteroid, Bullet } from '@game-zero/shared';
import { SERVER_PORT, CONTROLLER_URL, GAME_CONFIG } from '@game-zero/shared';

type AppState = 'connecting' | 'lobby' | 'playing';

export default function App() {
  const [appState, setAppState] = useState<AppState>('connecting');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [serverIp, setServerIp] = useState<string>('localhost');

  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixiRef = useRef<PIXI.Application | null>(null);
  const shipsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const asteroidsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const bulletsRef = useRef<Map<string, PIXI.Graphics>>(new Map());
  const gameStateRef = useRef<GameState | null>(null);

  // Detect server IP (for QR code)
  useEffect(() => {
    const host = window.location.hostname || 'localhost';

    // Fetch network IP from server for QR code
    fetch(`http://${host}:${SERVER_PORT}/info`)
      .then(res => res.json())
      .then(data => {
        if (data.networkIps && data.networkIps.length > 0) {
          // Use first non-169.254 IP (169.254 is link-local, not useful)
          const goodIp = data.networkIps.find((ip: string) => !ip.startsWith('169.254')) || data.networkIps[0];
          setServerIp(goodIp);
          console.log('Using network IP for QR:', goodIp);
        } else {
          setServerIp(host);
        }
      })
      .catch(() => {
        setServerIp(host);
      });
  }, []);

  // Initialize Pixi.js
  useEffect(() => {
    if (!canvasRef.current || pixiRef.current) return;

    const initPixi = async () => {
      const app = new PIXI.Application();
      await app.init({
        canvas: canvasRef.current!,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0x0a0a12,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      pixiRef.current = app;

      const onResize = () => {
        app.renderer.resize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', onResize);

      app.ticker.add(() => {
        renderGame();
      });
    };

    initPixi();

    return () => {
      pixiRef.current?.destroy(true);
      pixiRef.current = null;
    };
  }, []);

  // Generate QR code when room is created
  useEffect(() => {
    if (!roomCode || !serverIp) return;

    // Use cloud-hosted controller URL with local server as parameter
    const controllerUrl = `${CONTROLLER_URL}?room=${roomCode}&server=${serverIp}:${SERVER_PORT}`;
    console.log('QR Code URL:', controllerUrl);

    QRCode.toDataURL(controllerUrl, {
      width: 200,
      margin: 2,
      color: { dark: '#ffffff', light: '#0a0a12' },
    }).then(setQrDataUrl);
  }, [roomCode, serverIp]);

  // WebSocket connection
  useEffect(() => {
    const wsUrl = `ws://${serverIp}:${SERVER_PORT}`;
    console.log('Connecting to', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to server');
      ws.send(JSON.stringify({ type: 'create_room' }));
    };

    ws.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      handleMessage(message);
    };

    ws.onclose = () => {
      console.log('Disconnected from server');
      setAppState('connecting');
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    return () => {
      ws.close();
    };
  }, [serverIp]);

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'room_created':
        setRoomCode(message.roomCode);
        setAppState('lobby');
        break;
      case 'room_update':
        setRoomInfo(message.room);
        if (message.room.phase === 'playing') {
          setAppState('playing');
        }
        break;
      case 'game_state':
        gameStateRef.current = message.state;
        break;
      case 'error':
        console.error('Server error:', message.message);
        break;
    }
  }, []);

  const startGame = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'start_game' }));
  }, []);

  const renderGame = useCallback(() => {
    const app = pixiRef.current;
    const state = gameStateRef.current;
    if (!app || !state) return;

    // Calculate scale to fit world
    const scaleX = window.innerWidth / state.worldSize.x;
    const scaleY = window.innerHeight / state.worldSize.y;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (window.innerWidth - state.worldSize.x * scale) / 2;
    const offsetY = (window.innerHeight - state.worldSize.y * scale) / 2;

    // Helper to transform position
    const toScreen = (x: number, y: number) => ({
      x: offsetX + x * scale,
      y: offsetY + y * scale,
    });

    // === RENDER ASTEROIDS ===
    const activeAsteroidIds = new Set(state.asteroids.map((a) => a.id));

    for (const [id, sprite] of asteroidsRef.current) {
      if (!activeAsteroidIds.has(id)) {
        app.stage.removeChild(sprite);
        sprite.destroy();
        asteroidsRef.current.delete(id);
      }
    }

    for (const asteroid of state.asteroids) {
      let container = asteroidsRef.current.get(asteroid.id);

      if (!container) {
        container = createAsteroidSprite(asteroid);
        asteroidsRef.current.set(asteroid.id, container);
        app.stage.addChild(container);
      }

      const pos = toScreen(asteroid.position.x, asteroid.position.y);
      container.position.set(pos.x, pos.y);
      container.rotation = asteroid.rotation;
      container.scale.set(scale);
    }

    // === RENDER BULLETS ===
    const activeBulletIds = new Set(state.bullets.map((b) => b.id));

    for (const [id, sprite] of bulletsRef.current) {
      if (!activeBulletIds.has(id)) {
        app.stage.removeChild(sprite);
        sprite.destroy();
        bulletsRef.current.delete(id);
      }
    }

    for (const bullet of state.bullets) {
      let gfx = bulletsRef.current.get(bullet.id);

      if (!gfx) {
        gfx = createBulletSprite(bullet);
        bulletsRef.current.set(bullet.id, gfx);
        app.stage.addChild(gfx);
      }

      const pos = toScreen(bullet.position.x, bullet.position.y);
      gfx.position.set(pos.x, pos.y);
      gfx.scale.set(scale);
    }

    // === RENDER SHIPS ===
    const activeShipIds = new Set(state.ships.map((s) => s.id));

    for (const [id, sprite] of shipsRef.current) {
      if (!activeShipIds.has(id)) {
        app.stage.removeChild(sprite);
        sprite.destroy();
        shipsRef.current.delete(id);
      }
    }

    for (const ship of state.ships) {
      let container = shipsRef.current.get(ship.id);

      if (!container) {
        container = createShipSprite(ship);
        shipsRef.current.set(ship.id, container);
        app.stage.addChild(container);
      }

      const pos = toScreen(ship.position.x, ship.position.y);
      container.position.set(pos.x, pos.y);
      container.rotation = ship.rotation + Math.PI / 2;
      container.scale.set(scale);
      container.alpha = ship.isAlive ? 1 : 0.3;

      const flame = container.getChildByLabel('flame');
      if (flame) {
        flame.visible = ship.isThrusting && ship.isAlive;
      }

      // Update score display
      const scoreText = container.getChildByLabel('score') as PIXI.Text;
      if (scoreText) {
        scoreText.text = String(ship.score);
      }
    }
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />

      {appState === 'connecting' && (
        <div style={overlayStyle}>
          <h1 style={{ color: '#4ECDC4', fontSize: '3rem' }}>GAME-ZERO</h1>
          <p style={{ color: '#888' }}>Connecting to server...</p>
        </div>
      )}

      {appState === 'lobby' && roomInfo && (
        <div style={overlayStyle}>
          <h1 style={{ color: '#4ECDC4', fontSize: '3rem', marginBottom: '1rem' }}>
            COSMIC CHAOS
          </h1>

          <div style={{ display: 'flex', gap: '3rem', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              {qrDataUrl && (
                <img src={qrDataUrl} alt="QR Code" style={{ width: 200, height: 200 }} />
              )}
              <p style={{ color: '#888', marginTop: '0.5rem' }}>Scan to join</p>
            </div>

            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#888', fontSize: '1.2rem' }}>ROOM CODE</p>
              <p style={{ color: '#FFE66D', fontSize: '4rem', fontWeight: 'bold', letterSpacing: '0.3em' }}>
                {roomCode}
              </p>

              <p style={{ color: '#888', marginTop: '2rem' }}>
                Players: {roomInfo.players.length}/{roomInfo.maxPlayers}
              </p>

              <div style={{ marginTop: '1rem' }}>
                {roomInfo.players.map((p) => (
                  <span
                    key={p.id}
                    style={{
                      color: p.color,
                      margin: '0 0.5rem',
                      fontSize: '1.5rem',
                    }}
                  >
                    {p.name}
                  </span>
                ))}
              </div>

              {roomInfo.players.length >= 1 && (
                <button onClick={startGame} style={buttonStyle}>
                  START GAME
                </button>
              )}
            </div>
          </div>

          <p style={{ color: '#555', marginTop: '2rem', fontSize: '0.9rem' }}>
            {CONTROLLER_URL}?room={roomCode}
          </p>
        </div>
      )}

      {appState === 'playing' && roomCode && (
        <>
          {/* Room code + QR in corner */}
          <div style={{ position: 'absolute', top: 20, right: 20, textAlign: 'right' }}>
            <p style={{ color: '#FFE66D', fontSize: '1.5rem', opacity: 0.7 }}>{roomCode}</p>
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR"
                style={{ width: 80, height: 80, opacity: 0.7, marginTop: 10 }}
              />
            )}
          </div>

          {/* Scoreboard */}
          <div style={{ position: 'absolute', top: 20, left: 20 }}>
            {gameStateRef.current?.ships
              .slice()
              .sort((a, b) => b.score - a.score)
              .map((ship, i) => (
                <div
                  key={ship.id}
                  style={{
                    color: ship.color,
                    fontSize: '1.2rem',
                    opacity: ship.isAlive ? 1 : 0.5,
                    marginBottom: 4,
                  }}
                >
                  {i + 1}. {ship.name}: {ship.score}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function createShipSprite(ship: Ship): PIXI.Container {
  const container = new PIXI.Container();

  const body = new PIXI.Graphics();
  const color = parseInt(ship.color.replace('#', ''), 16);
  body.poly([
    { x: 0, y: -25 },
    { x: -18, y: 18 },
    { x: 0, y: 10 },
    { x: 18, y: 18 },
  ]);
  body.fill({ color });
  body.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
  container.addChild(body);

  const flame = new PIXI.Graphics();
  flame.label = 'flame';
  flame.poly([
    { x: -8, y: 15 },
    { x: 0, y: 40 },
    { x: 8, y: 15 },
  ]);
  flame.fill({ color: 0xff6600 });
  flame.visible = false;
  container.addChild(flame);

  const nameText = new PIXI.Text({
    text: ship.name,
    style: {
      fontFamily: 'Courier New',
      fontSize: 14,
      fill: 0xffffff,
    },
  });
  nameText.anchor.set(0.5, 0);
  nameText.position.set(0, 25);
  container.addChild(nameText);

  return container;
}

function createAsteroidSprite(asteroid: Asteroid): PIXI.Container {
  const container = new PIXI.Container();

  const gfx = new PIXI.Graphics();

  // Draw irregular polygon for asteroid shape
  const points: { x: number; y: number }[] = [];
  const segments = 8;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const variance = 0.7 + Math.random() * 0.3;
    points.push({
      x: Math.cos(angle) * asteroid.radius * variance,
      y: Math.sin(angle) * asteroid.radius * variance,
    });
  }

  gfx.poly(points);
  gfx.fill({ color: 0x444455 });
  gfx.stroke({ color: 0x666677, width: 2 });
  container.addChild(gfx);

  return container;
}

function createBulletSprite(bullet: Bullet): PIXI.Graphics {
  const gfx = new PIXI.Graphics();
  const color = parseInt(bullet.ownerColor.replace('#', ''), 16);

  gfx.circle(0, 0, GAME_CONFIG.BULLET_RADIUS);
  gfx.fill({ color });

  // Add glow effect
  gfx.circle(0, 0, GAME_CONFIG.BULLET_RADIUS * 2);
  gfx.fill({ color, alpha: 0.3 });

  return gfx;
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  backgroundColor: 'rgba(10, 10, 18, 0.95)',
};

const buttonStyle: React.CSSProperties = {
  marginTop: '2rem',
  padding: '1rem 3rem',
  fontSize: '1.5rem',
  fontFamily: 'Courier New',
  fontWeight: 'bold',
  color: '#0a0a12',
  backgroundColor: '#4ECDC4',
  border: 'none',
  cursor: 'pointer',
  transition: 'transform 0.1s',
};
