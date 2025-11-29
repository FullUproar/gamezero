import type { Ship, Player, GameState, PlayerInput, Asteroid, Bullet, Explosion } from '@game-zero/shared';
import { GAME_CONFIG } from '@game-zero/shared';

export class Room {
  code: string;
  players: Map<string, Player> = new Map();
  ships: Map<string, Ship> = new Map();
  asteroids: Map<string, Asteroid> = new Map();
  bullets: Map<string, Bullet> = new Map();
  explosions: Map<string, Explosion> = new Map();
  phase: 'lobby' | 'playing' | 'gameover' = 'lobby';
  tick = 0;
  private colorIndex = 0;
  private asteroidSpawnTimer = 0;
  private idCounter = 0;

  constructor(code: string) {
    this.code = code;
  }

  private generateId(): string {
    return `${this.code}-${++this.idCounter}`;
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

    // Create ship for player
    const ship = this.createShip(id, name, color);
    this.ships.set(id, ship);

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
  }

  private spawnAsteroid(size: 'large' | 'medium' | 'small' = 'large', position?: { x: number; y: number }): void {
    if (this.asteroids.size >= GAME_CONFIG.MAX_ASTEROIDS) return;

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

    // Update ships
    for (const ship of this.ships.values()) {
      if (!ship.isAlive) {
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

    // Update asteroids
    for (const asteroid of this.asteroids.values()) {
      asteroid.position.x += asteroid.velocity.x * dt;
      asteroid.position.y += asteroid.velocity.y * dt;
      asteroid.rotation += asteroid.angularVelocity * dt;

      this.wrapPosition(asteroid.position);
    }

    // Spawn new asteroids periodically
    this.asteroidSpawnTimer -= dt;
    if (this.asteroidSpawnTimer <= 0 && this.asteroids.size < GAME_CONFIG.MAX_ASTEROIDS) {
      this.spawnAsteroid('large');
      this.asteroidSpawnTimer = GAME_CONFIG.ASTEROID_SPAWN_INTERVAL;
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

    // Bullet vs Asteroid
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
          break;
        }
      }
    }

    // Ship vs Asteroid
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
    // Award points to killer if this was a player kill
    if (killerId && killerId !== ship.id) {
      const killer = this.ships.get(killerId);
      if (killer) {
        killer.score += 50; // Points for killing another player
      }
    }

    // Create explosion at ship position
    this.spawnExplosion(ship.position, ship.color, 'medium');

    ship.isAlive = false;
    ship.respawnTimer = GAME_CONFIG.SHIP_RESPAWN_TIME;
    ship.velocity = { x: 0, y: 0 };
  }

  private respawnShip(ship: Ship): void {
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

    // Spawn initial asteroids
    for (let i = 0; i < GAME_CONFIG.INITIAL_ASTEROIDS; i++) {
      this.spawnAsteroid('large');
    }
    this.asteroidSpawnTimer = GAME_CONFIG.ASTEROID_SPAWN_INTERVAL;
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
    };
  }

  getRoomInfo() {
    return {
      code: this.code,
      players: Array.from(this.players.values()),
      maxPlayers: GAME_CONFIG.MAX_PLAYERS,
      phase: this.phase,
    };
  }

  get playerCount(): number {
    return this.players.size;
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }
}
