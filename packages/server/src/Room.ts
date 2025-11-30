import type { Ship, Player, GameState, PlayerInput, Asteroid, Bullet, Explosion, GameMode, PlayerStats } from '@game-zero/shared';
import { GAME_CONFIG } from '@game-zero/shared';

const AI_NAMES = [
  'Inky', 'Blinky', 'Stinky', 'Clyde', 'Pinky',
  'Shadow', 'Speedy', 'Bashful', 'Pokey', 'Sue'
];
const TOTAL_PLAYERS = 10;

const GAME_DURATION = 180; // 3 minutes

// Internal stats tracking
interface InternalStats {
  kills: number;
  deaths: number;
  shotsFired: number;
  shotsHit: number;
  asteroidsDestroyed: number;
  killedBy: Map<string, number>; // playerId -> count (who killed me)
  killed: Map<string, number>; // playerId -> count (who I killed)
}

export class Room {
  code: string;
  players: Map<string, Player> = new Map();
  ships: Map<string, Ship> = new Map();
  asteroids: Map<string, Asteroid> = new Map();
  bullets: Map<string, Bullet> = new Map();
  explosions: Map<string, Explosion> = new Map();
  phase: 'lobby' | 'playing' | 'gameover' = 'lobby';
  tick = 0;
  leaderId: string | null = null; // First player to join
  gameTimer = GAME_DURATION; // Seconds remaining
  gameMode: GameMode = 'ffa'; // Default game mode

  // Statistics tracking
  private stats: Map<string, InternalStats> = new Map();

  private colorIndex = 0;
  private asteroidSpawnTimer = 0;
  private idCounter = 0;
  private aiShipIds: Set<string> = new Set();
  private aiState: Map<string, { targetId?: string; wanderAngle: number; nextThinkTime: number }> = new Map();

  constructor(code: string) {
    this.code = code;
  }

  setGameMode(mode: GameMode): void {
    if (this.phase === 'lobby') {
      this.gameMode = mode;
      console.log(`Room ${this.code} game mode set to: ${mode}`);
    }
  }

  private generateId(): string {
    return `${this.code}-${++this.idCounter}`;
  }

  private initStats(playerId: string): void {
    if (!this.stats.has(playerId)) {
      this.stats.set(playerId, {
        kills: 0,
        deaths: 0,
        shotsFired: 0,
        shotsHit: 0,
        asteroidsDestroyed: 0,
        killedBy: new Map(),
        killed: new Map(),
      });
    }
  }

  // Find existing player by name (for duplicate detection)
  findPlayerByName(name: string): { id: string; player: Player } | null {
    for (const [id, player] of this.players) {
      if (player.name.toLowerCase() === name.toLowerCase()) {
        return { id, player };
      }
    }
    return null;
  }

  addPlayer(id: string, name: string): Player {
    // Check for existing player with same name and remove them
    const existing = this.findPlayerByName(name);
    if (existing) {
      console.log(`Removing duplicate player: ${existing.player.name} (${existing.id})`);
      this.removePlayer(existing.id);
    }

    const color = GAME_CONFIG.PLAYER_COLORS[this.colorIndex % GAME_CONFIG.PLAYER_COLORS.length];
    this.colorIndex++;

    const player: Player = {
      id,
      name,
      color,
      isConnected: true,
    };
    this.players.set(id, player);

    // First player becomes the leader
    if (this.leaderId === null) {
      this.leaderId = id;
    }

    // Create ship for player
    const ship = this.createShip(id, name, color);
    this.ships.set(id, ship);

    // Initialize stats
    this.initStats(id);

    return player;
  }

  private createShip(playerId: string, name: string, color: string): Ship {
    const padding = 150;
    return {
      id: playerId,
      playerId,
      position: {
        x: padding + Math.random() * (GAME_CONFIG.WORLD_WIDTH - padding * 2),
        y: padding + Math.random() * (GAME_CONFIG.WORLD_HEIGHT - padding * 2),
      },
      velocity: { x: 0, y: 0 },
      rotation: Math.random() * Math.PI * 2,
      isThrusting: false,
      color,
      name,
      score: 0,
      isAlive: true,
      respawnTimer: 0,
      fireCooldown: 0,
      invulnTimer: GAME_CONFIG.SHIP_INVULN_TIME,
    };
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.ships.delete(id);

    // If leader leaves, assign new leader
    if (this.leaderId === id) {
      const remainingPlayers = Array.from(this.players.keys());
      this.leaderId = remainingPlayers.length > 0 ? remainingPlayers[0] : null;
    }
  }

  applyInput(playerId: string, input: PlayerInput): void {
    const ship = this.ships.get(playerId);
    if (!ship || !ship.isAlive) return;

    // Apply rotation from tilt
    ship.rotation += input.rotation * GAME_CONFIG.SHIP_ROTATION_SPEED * (1 / GAME_CONFIG.TICK_RATE);
    ship.isThrusting = input.thrust;

    // Handle firing (blocked while invulnerable)
    if (input.fire && ship.fireCooldown <= 0 && ship.invulnTimer <= 0) {
      this.fireBullet(ship);
      ship.fireCooldown = GAME_CONFIG.FIRE_COOLDOWN;
    }
  }

  private fireBullet(ship: Ship): void {
    const bullet: Bullet = {
      id: this.generateId(),
      ownerId: ship.id,
      ownerColor: ship.color,
      position: {
        x: ship.position.x + Math.cos(ship.rotation) * (GAME_CONFIG.SHIP_RADIUS + 10),
        y: ship.position.y + Math.sin(ship.rotation) * (GAME_CONFIG.SHIP_RADIUS + 10),
      },
      velocity: {
        x: Math.cos(ship.rotation) * GAME_CONFIG.BULLET_SPEED + ship.velocity.x * 0.5,
        y: Math.sin(ship.rotation) * GAME_CONFIG.BULLET_SPEED + ship.velocity.y * 0.5,
      },
      lifetime: GAME_CONFIG.BULLET_LIFETIME,
    };
    this.bullets.set(bullet.id, bullet);

    // Track shots fired
    const stats = this.stats.get(ship.id);
    if (stats) {
      stats.shotsFired++;
    }
  }

  private spawnAsteroid(size: 'large' | 'medium' | 'small' = 'large', position?: { x: number; y: number }): void {
    const maxAsteroids = this.gameMode === 'asteroid_hunters' ? 15 : GAME_CONFIG.MAX_ASTEROIDS;
    if (this.asteroids.size >= maxAsteroids) return;

    const config = GAME_CONFIG.ASTEROID_SIZES[size];
    const angle = Math.random() * Math.PI * 2;

    // Spawn from edges if no position specified
    let pos = position;
    if (!pos) {
      const edge = Math.floor(Math.random() * 4);
      switch (edge) {
        case 0: pos = { x: Math.random() * GAME_CONFIG.WORLD_WIDTH, y: -50 }; break;
        case 1: pos = { x: GAME_CONFIG.WORLD_WIDTH + 50, y: Math.random() * GAME_CONFIG.WORLD_HEIGHT }; break;
        case 2: pos = { x: Math.random() * GAME_CONFIG.WORLD_WIDTH, y: GAME_CONFIG.WORLD_HEIGHT + 50 }; break;
        default: pos = { x: -50, y: Math.random() * GAME_CONFIG.WORLD_HEIGHT }; break;
      }
    }

    const asteroid: Asteroid = {
      id: this.generateId(),
      position: { ...pos },
      velocity: {
        x: Math.cos(angle) * config.speed * (0.5 + Math.random() * 0.5),
        y: Math.sin(angle) * config.speed * (0.5 + Math.random() * 0.5),
      },
      rotation: Math.random() * Math.PI * 2,
      angularVelocity: (Math.random() - 0.5) * 2,
      size,
      radius: config.radius,
    };
    this.asteroids.set(asteroid.id, asteroid);
  }

  private spawnExplosion(
    position: { x: number; y: number },
    color: string,
    size: 'small' | 'medium' | 'large'
  ): void {
    const lifetimes = { small: 0.3, medium: 0.5, large: 0.7 };
    const lifetime = lifetimes[size];
    const explosion: Explosion = {
      id: this.generateId(),
      position: { ...position },
      color,
      size,
      lifetime,
      maxLifetime: lifetime,
    };
    this.explosions.set(explosion.id, explosion);
  }

  private splitAsteroid(asteroid: Asteroid, bulletOwnerId: string): void {
    const ship = this.ships.get(bulletOwnerId);
    if (ship) {
      ship.score += GAME_CONFIG.ASTEROID_SIZES[asteroid.size].score;
    }

    // Track asteroid destroyed
    const stats = this.stats.get(bulletOwnerId);
    if (stats) {
      stats.asteroidsDestroyed++;
      stats.shotsHit++; // Hitting an asteroid counts as a hit
    }

    // Create explosion
    const explosionSize = asteroid.size === 'large' ? 'large' : asteroid.size === 'medium' ? 'medium' : 'small';
    this.spawnExplosion(asteroid.position, '#888888', explosionSize);

    // Spawn smaller asteroids
    if (asteroid.size === 'large') {
      this.spawnAsteroid('medium', { ...asteroid.position });
      this.spawnAsteroid('medium', { ...asteroid.position });
    } else if (asteroid.size === 'medium') {
      this.spawnAsteroid('small', { ...asteroid.position });
      this.spawnAsteroid('small', { ...asteroid.position });
    }
    // Small asteroids just disappear
  }

  update(dt: number): void {
    if (this.phase !== 'playing') return;

    this.tick++;

    // Countdown game timer (not for knockout - knockout ends when 1 left)
    if (this.gameMode !== 'knockout') {
      this.gameTimer -= dt;
      if (this.gameTimer <= 0) {
        this.gameTimer = 0;
        this.phase = 'gameover';
        return;
      }
    } else {
      // Knockout: check if only one ship is alive
      const aliveShips = Array.from(this.ships.values()).filter(s => s.isAlive);
      if (aliveShips.length <= 1) {
        this.phase = 'gameover';
        return;
      }
    }

    // Update ships
    for (const ship of this.ships.values()) {
      if (!ship.isAlive) {
        // In knockout mode, dead ships stay dead
        if (this.gameMode === 'knockout') continue;

        ship.respawnTimer -= dt;
        if (ship.respawnTimer <= 0) {
          this.respawnShip(ship);
        }
        continue;
      }

      // Fire cooldown
      if (ship.fireCooldown > 0) {
        ship.fireCooldown -= dt;
      }

      // Invulnerability timer
      if (ship.invulnTimer > 0) {
        ship.invulnTimer -= dt;
      }

      // Apply thrust (no speed limit - go as fast as you want!)
      if (ship.isThrusting) {
        const thrustX = Math.cos(ship.rotation) * GAME_CONFIG.SHIP_ACCELERATION * dt;
        const thrustY = Math.sin(ship.rotation) * GAME_CONFIG.SHIP_ACCELERATION * dt;
        ship.velocity.x += thrustX;
        ship.velocity.y += thrustY;
      }

      // Apply drag
      ship.velocity.x *= GAME_CONFIG.SHIP_DRAG;
      ship.velocity.y *= GAME_CONFIG.SHIP_DRAG;

      // Move ship
      ship.position.x += ship.velocity.x * dt;
      ship.position.y += ship.velocity.y * dt;

      // Wrap around world
      this.wrapPosition(ship.position);
    }

    // Update bullets
    const bulletsToRemove: string[] = [];
    for (const bullet of this.bullets.values()) {
      bullet.position.x += bullet.velocity.x * dt;
      bullet.position.y += bullet.velocity.y * dt;
      bullet.lifetime -= dt;

      this.wrapPosition(bullet.position);

      if (bullet.lifetime <= 0) {
        bulletsToRemove.push(bullet.id);
      }
    }
    bulletsToRemove.forEach((id) => this.bullets.delete(id));

    // Update asteroids (only in asteroid_hunters mode or if MAX_ASTEROIDS > 0)
    if (this.gameMode === 'asteroid_hunters' || GAME_CONFIG.MAX_ASTEROIDS > 0) {
      for (const asteroid of this.asteroids.values()) {
        asteroid.position.x += asteroid.velocity.x * dt;
        asteroid.position.y += asteroid.velocity.y * dt;
        asteroid.rotation += asteroid.angularVelocity * dt;

        this.wrapPosition(asteroid.position);
      }

      // Spawn new asteroids periodically
      const spawnInterval = this.gameMode === 'asteroid_hunters' ? 5 : GAME_CONFIG.ASTEROID_SPAWN_INTERVAL;
      const maxAsteroids = this.gameMode === 'asteroid_hunters' ? 15 : GAME_CONFIG.MAX_ASTEROIDS;
      this.asteroidSpawnTimer -= dt;
      if (this.asteroidSpawnTimer <= 0 && this.asteroids.size < maxAsteroids) {
        this.spawnAsteroid('large');
        this.asteroidSpawnTimer = spawnInterval;
      }
    }

    // Update explosions
    const explosionsToRemove: string[] = [];
    for (const explosion of this.explosions.values()) {
      explosion.lifetime -= dt;
      if (explosion.lifetime <= 0) {
        explosionsToRemove.push(explosion.id);
      }
    }
    explosionsToRemove.forEach((id) => this.explosions.delete(id));

    // Update AI ships
    this.updateAI(dt);

    // Check collisions
    this.checkCollisions();
  }

  private wrapPosition(pos: { x: number; y: number }): void {
    if (pos.x < 0) pos.x += GAME_CONFIG.WORLD_WIDTH;
    if (pos.x > GAME_CONFIG.WORLD_WIDTH) pos.x -= GAME_CONFIG.WORLD_WIDTH;
    if (pos.y < 0) pos.y += GAME_CONFIG.WORLD_HEIGHT;
    if (pos.y > GAME_CONFIG.WORLD_HEIGHT) pos.y -= GAME_CONFIG.WORLD_HEIGHT;
  }

  private checkCollisions(): void {
    const asteroidsToRemove: string[] = [];
    const bulletsToRemove: string[] = [];
    const asteroidSplits: { asteroid: Asteroid; ownerId: string }[] = [];
    const shipsToKill: { ship: Ship; killerId?: string }[] = [];

    // Bullet vs Asteroid (only in asteroid_hunters or if asteroids exist)
    for (const bullet of this.bullets.values()) {
      if (bulletsToRemove.includes(bullet.id)) continue;

      for (const asteroid of this.asteroids.values()) {
        if (this.circleCollision(
          bullet.position, GAME_CONFIG.BULLET_RADIUS,
          asteroid.position, asteroid.radius
        )) {
          bulletsToRemove.push(bullet.id);
          asteroidsToRemove.push(asteroid.id);
          asteroidSplits.push({ asteroid, ownerId: bullet.ownerId });
          break;
        }
      }
    }

    // Bullet vs Ship (player combat!)
    for (const bullet of this.bullets.values()) {
      if (bulletsToRemove.includes(bullet.id)) continue;

      for (const ship of this.ships.values()) {
        // Don't hit own ship, skip dead ships, skip invulnerable ships
        if (ship.id === bullet.ownerId || !ship.isAlive || ship.invulnTimer > 0) continue;

        if (this.circleCollision(
          bullet.position, GAME_CONFIG.BULLET_RADIUS,
          ship.position, GAME_CONFIG.SHIP_RADIUS
        )) {
          bulletsToRemove.push(bullet.id);
          shipsToKill.push({ ship, killerId: bullet.ownerId });

          // Track shot hit
          const shooterStats = this.stats.get(bullet.ownerId);
          if (shooterStats) {
            shooterStats.shotsHit++;
          }
          break;
        }
      }
    }

    // Ship vs Asteroid (only if asteroids exist)
    for (const ship of this.ships.values()) {
      if (!ship.isAlive || ship.invulnTimer > 0) continue;

      for (const asteroid of this.asteroids.values()) {
        if (this.circleCollision(
          ship.position, GAME_CONFIG.SHIP_RADIUS,
          asteroid.position, asteroid.radius
        )) {
          shipsToKill.push({ ship });
          break;
        }
      }
    }

    // Ship vs Ship (ram combat!)
    const shipArray = Array.from(this.ships.values());
    for (let i = 0; i < shipArray.length; i++) {
      const ship1 = shipArray[i];
      if (!ship1.isAlive || ship1.invulnTimer > 0) continue;

      for (let j = i + 1; j < shipArray.length; j++) {
        const ship2 = shipArray[j];
        if (!ship2.isAlive || ship2.invulnTimer > 0) continue;

        if (this.circleCollision(
          ship1.position, GAME_CONFIG.SHIP_RADIUS,
          ship2.position, GAME_CONFIG.SHIP_RADIUS
        )) {
          // Both ships die in a collision
          shipsToKill.push({ ship: ship1 });
          shipsToKill.push({ ship: ship2 });
        }
      }
    }

    // Apply removals
    bulletsToRemove.forEach((id) => this.bullets.delete(id));
    asteroidsToRemove.forEach((id) => this.asteroids.delete(id));

    // Kill ships (dedupe in case ship was added multiple times)
    const killedShips = new Set<string>();
    shipsToKill.forEach(({ ship, killerId }) => {
      if (!killedShips.has(ship.id) && ship.isAlive) {
        killedShips.add(ship.id);
        this.killShip(ship, killerId);
      }
    });

    // Apply splits after removal
    asteroidSplits.forEach(({ asteroid, ownerId }) => {
      this.splitAsteroid(asteroid, ownerId);
    });
  }

  private circleCollision(
    pos1: { x: number; y: number }, r1: number,
    pos2: { x: number; y: number }, r2: number
  ): boolean {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const distSq = dx * dx + dy * dy;
    const radiusSum = r1 + r2;
    return distSq <= radiusSum * radiusSum;
  }

  private killShip(ship: Ship, killerId?: string): void {
    // Track death
    const victimStats = this.stats.get(ship.id);
    if (victimStats) {
      victimStats.deaths++;
      if (killerId && killerId !== ship.id) {
        const currentCount = victimStats.killedBy.get(killerId) || 0;
        victimStats.killedBy.set(killerId, currentCount + 1);
      }
    }

    // Award points to killer if this was a player kill
    if (killerId && killerId !== ship.id) {
      const killer = this.ships.get(killerId);
      if (killer) {
        killer.score += 50; // Points for killing another player
      }

      // Track kill for killer
      const killerStats = this.stats.get(killerId);
      if (killerStats) {
        killerStats.kills++;
        const currentCount = killerStats.killed.get(ship.id) || 0;
        killerStats.killed.set(ship.id, currentCount + 1);
      }
    }

    // Create explosion at ship position
    this.spawnExplosion(ship.position, ship.color, 'medium');

    ship.isAlive = false;
    ship.respawnTimer = GAME_CONFIG.SHIP_RESPAWN_TIME;
    ship.velocity = { x: 0, y: 0 };
  }

  private respawnShip(ship: Ship): void {
    // In knockout mode, ships don't respawn
    if (this.gameMode === 'knockout') return;

    const padding = 150;
    ship.position = {
      x: padding + Math.random() * (GAME_CONFIG.WORLD_WIDTH - padding * 2),
      y: padding + Math.random() * (GAME_CONFIG.WORLD_HEIGHT - padding * 2),
    };
    ship.velocity = { x: 0, y: 0 };
    ship.rotation = Math.random() * Math.PI * 2;
    ship.isAlive = true;
    ship.respawnTimer = 0;
    ship.invulnTimer = GAME_CONFIG.SHIP_INVULN_TIME;
  }

  startGame(): void {
    this.phase = 'playing';
    this.tick = 0;
    this.gameTimer = GAME_DURATION;

    // Spawn initial asteroids based on game mode
    const initialAsteroids = this.gameMode === 'asteroid_hunters' ? 5 : GAME_CONFIG.INITIAL_ASTEROIDS;
    for (let i = 0; i < initialAsteroids; i++) {
      this.spawnAsteroid('large');
    }
    this.asteroidSpawnTimer = this.gameMode === 'asteroid_hunters' ? 5 : GAME_CONFIG.ASTEROID_SPAWN_INTERVAL;

    // Spawn AI ships to fill up to TOTAL_PLAYERS (10)
    const humanCount = this.players.size;
    const aiCount = TOTAL_PLAYERS - humanCount;
    for (let i = 0; i < aiCount; i++) {
      const aiId = `ai-${this.generateId()}`;
      const name = AI_NAMES[i] || `Bot-${i + 1}`;
      const color = GAME_CONFIG.PLAYER_COLORS[(this.colorIndex++) % GAME_CONFIG.PLAYER_COLORS.length];
      const ship = this.createShip(aiId, name, color);
      this.ships.set(aiId, ship);
      this.aiShipIds.add(aiId);
      this.aiState.set(aiId, {
        wanderAngle: Math.random() * Math.PI * 2,
        nextThinkTime: 0,
      });
      // Initialize AI stats
      this.initStats(aiId);
    }
  }

  private updateAI(dt: number): void {
    for (const aiId of this.aiShipIds) {
      const ship = this.ships.get(aiId);
      if (!ship || !ship.isAlive) continue;

      let state = this.aiState.get(aiId);
      if (!state) {
        state = { wanderAngle: Math.random() * Math.PI * 2, nextThinkTime: 0 };
        this.aiState.set(aiId, state);
      }

      // Medium AI: Think moderately (0.5-1.5 seconds) - halfway between smart and stormtrooper
      state.nextThinkTime -= dt;
      if (state.nextThinkTime <= 0) {
        state.nextThinkTime = 0.5 + Math.random() * 1.0;

        // 60% chance to pick a target, 40% to wander
        if (Math.random() < 0.6) {
          // Find closest ship to chase (prioritize humans, but also attack other AI)
          const allTargets = Array.from(this.ships.values()).filter(
            (s) => s.id !== aiId && s.isAlive && s.invulnTimer <= 0
          );
          if (allTargets.length > 0) {
            // Pick closest target
            let closest = allTargets[0];
            let closestDist = Infinity;
            for (const t of allTargets) {
              const dx = t.position.x - ship.position.x;
              const dy = t.position.y - ship.position.y;
              const dist = dx * dx + dy * dy;
              if (dist < closestDist) {
                closestDist = dist;
                closest = t;
              }
            }
            state.targetId = closest.id;
          } else {
            state.targetId = undefined;
          }
        } else {
          state.targetId = undefined;
          state.wanderAngle += (Math.random() - 0.5) * Math.PI;
        }
      }

      // Determine desired angle with reduced lead prediction
      let desiredAngle = state.wanderAngle;
      const target = state.targetId ? this.ships.get(state.targetId) : undefined;
      if (target && target.isAlive) {
        // Lead the target based on their velocity (reduced prediction)
        const dx = target.position.x - ship.position.x;
        const dy = target.position.y - ship.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const bulletTime = dist / GAME_CONFIG.BULLET_SPEED;

        // Predict where target will be (half as accurate)
        const predictX = target.position.x + target.velocity.x * bulletTime * 0.35;
        const predictY = target.position.y + target.velocity.y * bulletTime * 0.35;

        desiredAngle = Math.atan2(predictY - ship.position.y, predictX - ship.position.x);
        // Medium inaccuracy (halfway between skilled and stormtrooper)
        desiredAngle += (Math.random() - 0.5) * 0.5;
      }

      // Turn towards desired angle at 75% speed
      let angleDiff = desiredAngle - ship.rotation;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const turnSpeed = GAME_CONFIG.SHIP_ROTATION_SPEED * 0.75; // 75% turn speed
      if (Math.abs(angleDiff) > 0.05) {
        ship.rotation += Math.sign(angleDiff) * turnSpeed * dt;
      }

      // Thrust often when chasing, otherwise occasionally
      ship.isThrusting = target ? Math.random() < 0.7 : Math.random() < 0.3;

      // Fire if roughly facing target (wider tolerance)
      if (target && Math.abs(angleDiff) < 0.5 && ship.fireCooldown <= 0 && ship.invulnTimer <= 0) {
        this.fireBullet(ship);
        ship.fireCooldown = GAME_CONFIG.FIRE_COOLDOWN * 1.5; // Slightly slower fire rate
      }
    }
  }

  private getPlayerStats(): PlayerStats[] {
    const result: PlayerStats[] = [];

    for (const ship of this.ships.values()) {
      const stats = this.stats.get(ship.id);
      if (!stats) continue;

      // Find nemesis (who killed this player most)
      let nemesis: { id: string; name: string; count: number } | null = null;
      let maxKilledBy = 0;
      for (const [killerId, count] of stats.killedBy) {
        if (count > maxKilledBy) {
          maxKilledBy = count;
          const killerShip = this.ships.get(killerId);
          if (killerShip) {
            nemesis = { id: killerId, name: killerShip.name, count };
          }
        }
      }

      // Find victim (who this player killed most)
      let victim: { id: string; name: string; count: number } | null = null;
      let maxKilled = 0;
      for (const [victimId, count] of stats.killed) {
        if (count > maxKilled) {
          maxKilled = count;
          const victimShip = this.ships.get(victimId);
          if (victimShip) {
            victim = { id: victimId, name: victimShip.name, count };
          }
        }
      }

      result.push({
        playerId: ship.id,
        playerName: ship.name,
        playerColor: ship.color,
        kills: stats.kills,
        deaths: stats.deaths,
        shotsFired: stats.shotsFired,
        shotsHit: stats.shotsHit,
        asteroidsDestroyed: stats.asteroidsDestroyed,
        nemesis,
        victim,
      });
    }

    return result;
  }

  getState(): GameState {
    return {
      tick: this.tick,
      timestamp: Date.now(),
      phase: this.phase,
      ships: Array.from(this.ships.values()),
      asteroids: Array.from(this.asteroids.values()),
      bullets: Array.from(this.bullets.values()),
      explosions: Array.from(this.explosions.values()),
      worldSize: {
        x: GAME_CONFIG.WORLD_WIDTH,
        y: GAME_CONFIG.WORLD_HEIGHT,
      },
      timeRemaining: Math.ceil(this.gameTimer),
      gameMode: this.gameMode,
      stats: this.getPlayerStats(),
    };
  }

  getRoomInfo() {
    return {
      code: this.code,
      players: Array.from(this.players.values()),
      maxPlayers: GAME_CONFIG.MAX_PLAYERS,
      phase: this.phase,
      leaderId: this.leaderId,
      gameMode: this.gameMode,
    };
  }

  get playerCount(): number {
    return this.players.size;
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }

  // Cleanup after game ends to free memory
  cleanup(): void {
    // Clear game objects
    this.bullets.clear();
    this.asteroids.clear();
    this.explosions.clear();

    // Clear AI data
    this.aiShipIds.clear();
    this.aiState.clear();

    // Clear AI ships but keep human ships for gameover display
    for (const shipId of Array.from(this.ships.keys())) {
      if (shipId.startsWith('ai-')) {
        this.ships.delete(shipId);
      }
    }

    // Clear stats Maps' internal Maps to free memory
    for (const stat of this.stats.values()) {
      stat.killedBy.clear();
      stat.killed.clear();
    }

    console.log(`Room ${this.code} cleaned up`);
  }
}
