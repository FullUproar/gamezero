import { GAME_CONFIG } from '@game-zero/shared';

export class GameLoop {
  private tickInterval: number;
  private lastTick: number = 0;
  private accumulator: number = 0;
  private running: boolean = false;
  private broadcastCounter = 0;

  constructor(
    private onTick: (dt: number) => void,
    private onBroadcast: () => void
  ) {
    this.tickInterval = 1000 / GAME_CONFIG.TICK_RATE;
  }

  start(): void {
    this.running = true;
    this.lastTick = performance.now();
    this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private loop = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const delta = now - this.lastTick;
    this.lastTick = now;
    this.accumulator += delta;

    // Fixed timestep updates
    while (this.accumulator >= this.tickInterval) {
      this.onTick(this.tickInterval / 1000);
      this.accumulator -= this.tickInterval;

      // Broadcast at lower rate
      this.broadcastCounter++;
      const broadcastInterval = GAME_CONFIG.TICK_RATE / GAME_CONFIG.BROADCAST_RATE;
      if (this.broadcastCounter >= broadcastInterval) {
        this.onBroadcast();
        this.broadcastCounter = 0;
      }
    }

    setImmediate(this.loop);
  };
}
