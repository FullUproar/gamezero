import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import QRCode from 'qrcode';
import type { ServerMessage, GameState, RoomInfo, Ship, Asteroid, Bullet, Explosion, PlayerStats, GameMode } from '@game-zero/shared';
import { SERVER_PORT, CONTROLLER_PORT, CONTROLLER_URL, GAME_CONFIG, GAME_MODE_NAMES } from '@game-zero/shared';

type AppState = 'connecting' | 'lobby' | 'playing' | 'gameover';

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
  const explosionsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const gameStateRef = useRef<GameState | null>(null);

  // UI state for timer/scores (separate from ref to trigger re-renders)
  const [displayState, setDisplayState] = useState<{
    timeRemaining: number;
    ships: Ship[];
    stats: PlayerStats[];
    gameMode: GameMode;
  }>({
    timeRemaining: 180,
    ships: [],
    stats: [],
    gameMode: 'ffa',
  });

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

    let onResize: (() => void) | null = null;

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

      onResize = () => {
        app.renderer.resize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', onResize);

      app.ticker.add(() => {
        renderGame();
      });
    };

    initPixi();

    return () => {
      // Remove resize listener
      if (onResize) {
        window.removeEventListener('resize', onResize);
      }

      // Clear sprite refs (they hold references to Pixi objects)
      shipsRef.current.clear();
      asteroidsRef.current.clear();
      bulletsRef.current.clear();
      explosionsRef.current.clear();

      // Clear game state ref
      gameStateRef.current = null;

      // Destroy Pixi app
      pixiRef.current?.destroy(true);
      pixiRef.current = null;
    };
  }, []);

  // Generate QR code when room is created
  useEffect(() => {
    if (!roomCode) return;

    // Use the Cloudflare Tunnel URL for WSS connection from HTTPS controller
    // This allows gamezero.live (HTTPS) to connect via WSS to the local game server
    const tunnelUrl = 'picture-foam-cables-learned.trycloudflare.com';
    const controllerUrl = `${CONTROLLER_URL}?room=${roomCode}&server=${tunnelUrl}`;
    console.log('QR Code URL:', controllerUrl);

    QRCode.toDataURL(controllerUrl, {
      width: 200,
      margin: 2,
      color: { dark: '#ffffff', light: '#0a0a12' },
    }).then(setQrDataUrl);
  }, [roomCode]);

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
        } else if (message.room.phase === 'gameover') {
          setAppState('gameover');
          // Stop the Pixi ticker to reduce CPU usage
          if (pixiRef.current) {
            pixiRef.current.ticker.stop();
          }
        }
        break;
      case 'game_state':
        gameStateRef.current = message.state;
        // Update display state for UI (timer, scores, stats)
        setDisplayState({
          timeRemaining: message.state.timeRemaining,
          ships: message.state.ships,
          stats: message.state.stats || [],
          gameMode: message.state.gameMode || 'ffa',
        });
        // Check for gameover
        if (message.state.phase === 'gameover') {
          setAppState('gameover');
          // Stop the Pixi ticker to reduce CPU usage
          if (pixiRef.current) {
            pixiRef.current.ticker.stop();
          }
        }
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

      // Hide dead ships completely (just show explosion)
      if (!ship.isAlive) {
        container.visible = false;
        continue;
      }

      container.visible = true;
      const pos = toScreen(ship.position.x, ship.position.y);
      container.position.set(pos.x, pos.y);
      container.rotation = ship.rotation + Math.PI / 2;
      container.scale.set(scale);

      // Ghosted effect when invulnerable
      container.alpha = ship.invulnTimer > 0 ? 0.4 : 1;

      const flame = container.getChildByLabel('flame');
      if (flame) {
        flame.visible = ship.isThrusting;
      }

      // Update score display
      const scoreText = container.getChildByLabel('score') as PIXI.Text;
      if (scoreText) {
        scoreText.text = String(ship.score);
      }
    }

    // === RENDER EXPLOSIONS ===
    const activeExplosionIds = new Set((state.explosions || []).map((e) => e.id));

    for (const [id, sprite] of explosionsRef.current) {
      if (!activeExplosionIds.has(id)) {
        app.stage.removeChild(sprite);
        sprite.destroy();
        explosionsRef.current.delete(id);
      }
    }

    for (const explosion of state.explosions || []) {
      let container = explosionsRef.current.get(explosion.id);

      if (!container) {
        container = createExplosionSprite(explosion);
        explosionsRef.current.set(explosion.id, container);
        app.stage.addChild(container);
      }

      const pos = toScreen(explosion.position.x, explosion.position.y);
      container.position.set(pos.x, pos.y);

      // Animate explosion: grow and fade
      const progress = 1 - (explosion.lifetime / explosion.maxLifetime);
      const explosionScale = scale * (0.5 + progress * 1.5); // Grow from 0.5x to 2x
      container.scale.set(explosionScale);
      container.alpha = 1 - progress * 0.8; // Fade from 1 to 0.2
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
            http://{serverIp}:{CONTROLLER_PORT}?room={roomCode}
          </p>
        </div>
      )}

      {appState === 'playing' && roomCode && (
        <>
          {/* Right panel - Timer and Scores */}
          <div style={scorePanelStyle}>
            {/* Timer */}
            <div style={timerStyle}>
              {formatTime(displayState.timeRemaining)}
            </div>

            {/* Divider */}
            <div style={{ borderBottom: '1px solid #333', margin: '10px 0' }} />

            {/* Room code + QR */}
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <span style={{ color: '#FFE66D', fontSize: '1rem', opacity: 0.7 }}>{roomCode}</span>
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="QR"
                  style={{ width: 60, height: 60, opacity: 0.7, marginTop: 5, display: 'block', margin: '5px auto 0' }}
                />
              )}
            </div>

            {/* Divider */}
            <div style={{ borderBottom: '1px solid #333', margin: '10px 0' }} />

            {/* Scoreboard */}
            <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 5 }}>SCORES</div>
            {displayState.ships
              .slice()
              .sort((a, b) => b.score - a.score)
              .map((ship, i) => (
                <div
                  key={ship.id}
                  style={{
                    color: ship.color,
                    fontSize: '1rem',
                    opacity: ship.isAlive ? 1 : 0.4,
                    marginBottom: 3,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{i + 1}. {ship.name}</span>
                  <span style={{ fontFamily: 'monospace' }}>{ship.score}</span>
                </div>
              ))}
          </div>
        </>
      )}

      {/* Gameover Screen */}
      {appState === 'gameover' && displayState.ships.length > 0 && (
        <div style={gameoverOverlayStyle}>
          <h1 style={{ color: '#FFE66D', fontSize: '3.5rem', marginBottom: '0.5rem' }}>GAME OVER</h1>
          <p style={{ color: '#4ECDC4', fontSize: '1.2rem', marginBottom: '1.5rem' }}>
            {GAME_MODE_NAMES[displayState.gameMode]}
          </p>

          <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
            {/* Rankings */}
            <div style={rankingContainerStyle}>
              <h2 style={{ color: '#4ECDC4', marginBottom: '1rem', fontSize: '1.3rem' }}>FINAL RANKINGS</h2>
              {displayState.ships
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((ship, i) => (
                  <div
                    key={ship.id}
                    style={{
                      ...rankingRowStyle,
                      backgroundColor: i === 0 ? 'rgba(255, 230, 109, 0.2)' : 'transparent',
                      borderColor: i === 0 ? '#FFE66D' : '#333',
                    }}
                  >
                    <span style={{ color: i === 0 ? '#FFE66D' : '#888', fontSize: '1.5rem', width: 40 }}>
                      {i === 0 ? '🏆' : `${i + 1}.`}
                    </span>
                    <span style={{ color: ship.color, flex: 1, fontSize: '1.2rem' }}>{ship.name}</span>
                    <span style={{ color: '#fff', fontSize: '1.2rem', fontFamily: 'monospace' }}>{ship.score}</span>
                  </div>
                ))}
            </div>

            {/* Statistics */}
            <div style={statsContainerStyle}>
              <h2 style={{ color: '#4ECDC4', marginBottom: '1rem', fontSize: '1.3rem' }}>PLAYER STATS</h2>
              {displayState.stats
                .filter(s => !s.playerId.startsWith('ai-')) // Only show human players
                .map((stat) => {
                  const accuracy = stat.shotsFired > 0 ? Math.round((stat.shotsHit / stat.shotsFired) * 100) : 0;
                  return (
                    <div key={stat.playerId} style={statCardStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ color: stat.playerColor, fontSize: '1.1rem', fontWeight: 'bold' }}>
                          {stat.playerName}
                        </span>
                      </div>
                      <div style={statRowStyle}>
                        <span>K/D</span>
                        <span>{stat.kills}/{stat.deaths}</span>
                      </div>
                      <div style={statRowStyle}>
                        <span>Accuracy</span>
                        <span>{accuracy}%</span>
                      </div>
                      {displayState.gameMode === 'asteroid_hunters' && (
                        <div style={statRowStyle}>
                          <span>Asteroids</span>
                          <span>{stat.asteroidsDestroyed}</span>
                        </div>
                      )}
                      {stat.victim && (
                        <div style={statRowStyle}>
                          <span>Hunted</span>
                          <span style={{ color: '#FF6B6B' }}>{stat.victim.name} ({stat.victim.count}x)</span>
                        </div>
                      )}
                      {stat.nemesis && (
                        <div style={statRowStyle}>
                          <span>Nemesis</span>
                          <span style={{ color: '#FF6B6B' }}>{stat.nemesis.name} ({stat.nemesis.count}x)</span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          <p style={{ color: '#666', marginTop: '1.5rem' }}>Refresh page to play again</p>
        </div>
      )}
    </div>
  );
}

// 10 unique ship shape designs (scaled to 40% - doubled again)
const SHIP_SHAPES: Array<{ body: Array<{x: number, y: number}>, flame: Array<{x: number, y: number}> }> = [
  // 0: Classic arrow
  { body: [{x:0,y:-10},{x:-7.2,y:7.2},{x:0,y:4},{x:7.2,y:7.2}], flame: [{x:-2.4,y:4.8},{x:0,y:14},{x:2.4,y:4.8}] },
  // 1: Dart/needle
  { body: [{x:0,y:-12},{x:-3.2,y:8},{x:0,y:6},{x:3.2,y:8}], flame: [{x:-1.6,y:6.4},{x:0,y:15.2},{x:1.6,y:6.4}] },
  // 2: Wide wings
  { body: [{x:0,y:-8},{x:-10,y:6},{x:-4,y:3.2},{x:0,y:4.8},{x:4,y:3.2},{x:10,y:6}], flame: [{x:-2,y:4},{x:0,y:12},{x:2,y:4}] },
  // 3: Diamond
  { body: [{x:0,y:-10},{x:-6,y:0},{x:0,y:8},{x:6,y:0}], flame: [{x:-2,y:6},{x:0,y:14},{x:2,y:6}] },
  // 4: Trident
  { body: [{x:0,y:-11.2},{x:-2,y:-4},{x:-7.2,y:-6},{x:-4.8,y:7.2},{x:0,y:4.8},{x:4.8,y:7.2},{x:7.2,y:-6},{x:2,y:-4}], flame: [{x:-2,y:4.8},{x:0,y:12.8},{x:2,y:4.8}] },
  // 5: Bat wings
  { body: [{x:0,y:-8.8},{x:-8.8,y:2},{x:-6,y:7.2},{x:0,y:4},{x:6,y:7.2},{x:8.8,y:2}], flame: [{x:-2,y:4.8},{x:0,y:12.8},{x:2,y:4.8}] },
  // 6: Stealth/angular
  { body: [{x:0,y:-10},{x:-8,y:4},{x:-6,y:7.2},{x:-2,y:4.8},{x:0,y:7.2},{x:2,y:4.8},{x:6,y:7.2},{x:8,y:4}], flame: [{x:-1.2,y:5.6},{x:0,y:12},{x:1.2,y:5.6}] },
  // 7: Rocket
  { body: [{x:0,y:-11.2},{x:-4,y:-4},{x:-4,y:6},{x:-6,y:8},{x:0,y:4.8},{x:6,y:8},{x:4,y:6},{x:4,y:-4}], flame: [{x:-2.4,y:5.6},{x:0,y:14},{x:2.4,y:5.6}] },
  // 8: X-wing style
  { body: [{x:0,y:-10},{x:-3.2,y:0},{x:-8,y:8},{x:-2,y:4},{x:0,y:6},{x:2,y:4},{x:8,y:8},{x:3.2,y:0}], flame: [{x:-1.6,y:4.8},{x:0,y:11.2},{x:1.6,y:4.8}] },
  // 9: Crescent
  { body: [{x:0,y:-8.8},{x:-7.2,y:-2},{x:-8,y:6},{x:-3.2,y:3.2},{x:0,y:6},{x:3.2,y:3.2},{x:8,y:6},{x:7.2,y:-2}], flame: [{x:-2,y:4.8},{x:0,y:12},{x:2,y:4.8}] },
];

function createShipSprite(ship: Ship): PIXI.Container {
  const container = new PIXI.Container();

  // Determine shape index from color (colors are assigned in order)
  const colorIndex = GAME_CONFIG.PLAYER_COLORS.indexOf(ship.color);
  const shapeIndex = colorIndex >= 0 ? colorIndex % SHIP_SHAPES.length : 0;
  const shape = SHIP_SHAPES[shapeIndex];

  const body = new PIXI.Graphics();
  const color = parseInt(ship.color.replace('#', ''), 16);
  body.poly(shape.body);
  body.fill({ color });
  body.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
  container.addChild(body);

  const flame = new PIXI.Graphics();
  flame.label = 'flame';
  flame.poly(shape.flame);
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

function createExplosionSprite(explosion: Explosion): PIXI.Container {
  const container = new PIXI.Container();
  const color = parseInt(explosion.color.replace('#', ''), 16);

  // Size based on explosion type
  const baseSizes = { small: 15, medium: 35, large: 55 };
  const baseSize = baseSizes[explosion.size];

  // Create multiple particles for explosion effect
  const particleCount = explosion.size === 'large' ? 12 : explosion.size === 'medium' ? 8 : 5;

  for (let i = 0; i < particleCount; i++) {
    const particle = new PIXI.Graphics();
    const angle = (i / particleCount) * Math.PI * 2;
    const distance = baseSize * (0.3 + Math.random() * 0.7);
    const particleSize = baseSize * (0.2 + Math.random() * 0.3);

    particle.circle(0, 0, particleSize);
    particle.fill({ color });
    particle.position.set(
      Math.cos(angle) * distance,
      Math.sin(angle) * distance
    );
    container.addChild(particle);
  }

  // Center glow
  const centerGlow = new PIXI.Graphics();
  centerGlow.circle(0, 0, baseSize * 0.6);
  centerGlow.fill({ color: 0xffffff, alpha: 0.8 });
  container.addChild(centerGlow);

  // Outer ring
  const ring = new PIXI.Graphics();
  ring.circle(0, 0, baseSize);
  ring.stroke({ color, width: 3, alpha: 0.6 });
  container.addChild(ring);

  return container;
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

const scorePanelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  width: 220,
  backgroundColor: 'rgba(10, 10, 18, 0.95)',
  borderLeft: '2px solid #4ECDC4',
  padding: '20px 15px',
  display: 'flex',
  flexDirection: 'column',
};

const timerStyle: React.CSSProperties = {
  fontSize: '2.5rem',
  fontFamily: 'Courier New',
  fontWeight: 'bold',
  color: '#FFE66D',
  textAlign: 'center',
};

const gameoverOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(10, 10, 18, 0.95)',
  zIndex: 100,
};

const rankingContainerStyle: React.CSSProperties = {
  backgroundColor: 'rgba(30, 30, 50, 0.8)',
  border: '2px solid #4ECDC4',
  borderRadius: 12,
  padding: '2rem',
  minWidth: 400,
  maxWidth: 600,
};

const rankingRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '0.75rem 1rem',
  marginBottom: 8,
  border: '1px solid #333',
  borderRadius: 6,
};

const statsContainerStyle: React.CSSProperties = {
  backgroundColor: 'rgba(30, 30, 50, 0.8)',
  border: '2px solid #4ECDC4',
  borderRadius: 12,
  padding: '1.5rem',
  minWidth: 300,
  maxWidth: 450,
  maxHeight: '60vh',
  overflowY: 'auto',
};

const statCardStyle: React.CSSProperties = {
  backgroundColor: 'rgba(20, 20, 35, 0.9)',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '0.75rem',
  marginBottom: '0.75rem',
};

const statRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '0.85rem',
  color: '#aaa',
  marginBottom: 4,
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
