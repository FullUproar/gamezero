import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import type { ClientMessage, ServerMessage } from '@game-zero/shared';
import { SERVER_PORT } from '@game-zero/shared';
import { Room } from './Room.js';
import { GameLoop } from './GameLoop.js';

interface Client {
  ws: WebSocket;
  id: string;
  roomCode: string | null;
  type: 'controller' | 'display';
}

class GameServer {
  private wss: WebSocketServer;
  private rooms: Map<string, Room> = new Map();
  private clients: Map<WebSocket, Client> = new Map();
  private gameLoops: Map<string, GameLoop> = new Map();
  private networkIps: string[] = [];

  constructor(port: number) {
    // Get network IPs synchronously for API
    this.detectNetworkIps();

    const server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');

      // Return network IPs for display to use in QR code
      if (req.url === '/info') {
        res.end(JSON.stringify({
          status: 'ok',
          rooms: this.rooms.size,
          networkIps: this.networkIps,
          port: port,
        }));
        return;
      }

      res.end(JSON.stringify({ status: 'ok', rooms: this.rooms.size }));
    });

    this.wss = new WebSocketServer({ server });
    this.wss.on('connection', this.handleConnection.bind(this));

    server.listen(port, '0.0.0.0', () => {
      console.log(`🎮 Game-Zero server running on port ${port}`);
      console.log(`   WebSocket: ws://localhost:${port}`);
      this.logLocalIPs(port);
    });
  }

  private detectNetworkIps(): void {
    import('os').then((os) => {
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net.family === 'IPv4' && !net.internal) {
            this.networkIps.push(net.address);
          }
        }
      }
    });
  }

  private logLocalIPs(port: number): void {
    console.log('\n📱 For phone controllers, use one of these IPs:');
    for (const ip of this.networkIps) {
      console.log(`   http://${ip}:${port}`);
    }
    console.log('');
  }

  private handleConnection(ws: WebSocket): void {
    const client: Client = {
      ws,
      id: generateId(),
      roomCode: null,
      type: 'controller',
    };
    this.clients.set(ws, client);
    console.log(`Client connected: ${client.id}`);

    ws.on('message', (data) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString());
        this.handleMessage(client, message);
      } catch (e) {
        console.error('Invalid message:', e);
      }
    });

    ws.on('close', () => this.handleDisconnect(client));
    ws.on('error', (err) => console.error('WebSocket error:', err));
  }

  private handleMessage(client: Client, message: ClientMessage): void {
    switch (message.type) {
      case 'create_room':
        this.createRoom(client);
        break;
      case 'join_room':
        this.joinRoom(client, message.roomCode.toUpperCase(), message.playerName);
        break;
      case 'display_connect':
        this.connectDisplay(client, message.roomCode.toUpperCase());
        break;
      case 'player_input':
        this.handleInput(client, message.input);
        break;
      case 'start_game':
        this.startGame(client);
        break;
      case 'leave_room':
        this.leaveRoom(client);
        break;
    }
  }

  private createRoom(client: Client): void {
    const code = generateRoomCode();
    const room = new Room(code);
    this.rooms.set(code, room);

    client.roomCode = code;
    client.type = 'display';

    console.log(`Room created: ${code}`);
    this.send(client.ws, { type: 'room_created', roomCode: code });
    this.send(client.ws, { type: 'room_update', room: room.getRoomInfo() });
  }

  private joinRoom(client: Client, roomCode: string, playerName: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) {
      this.send(client.ws, {
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: `Room ${roomCode} not found`,
      });
      return;
    }

    if (room.playerCount >= room.getRoomInfo().maxPlayers) {
      this.send(client.ws, {
        type: 'error',
        code: 'ROOM_FULL',
        message: 'Room is full',
      });
      return;
    }

    client.roomCode = roomCode;
    client.type = 'controller';

    room.addPlayer(client.id, playerName);
    console.log(`Player ${playerName} joined room ${roomCode}`);

    // Send room update to all clients in room
    this.broadcastToRoom(roomCode, { type: 'room_update', room: room.getRoomInfo() });

    // If game already playing, send current state
    if (room.phase === 'playing') {
      this.send(client.ws, {
        type: 'game_state',
        state: room.getState(),
        yourShipId: client.id,
      });
    }
  }

  private connectDisplay(client: Client, roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) {
      this.send(client.ws, {
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: `Room ${roomCode} not found`,
      });
      return;
    }

    client.roomCode = roomCode;
    client.type = 'display';

    this.send(client.ws, { type: 'room_update', room: room.getRoomInfo() });
  }

  private handleInput(client: Client, input: any): void {
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (!room) return;

    room.applyInput(client.id, input);
  }

  private startGame(client: Client): void {
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (!room) return;

    if (room.playerCount < 1) {
      this.send(client.ws, {
        type: 'error',
        code: 'NOT_ENOUGH_PLAYERS',
        message: 'Need at least 1 player to start',
      });
      return;
    }

    room.startGame();
    console.log(`Game started in room ${client.roomCode}`);

    // Start game loop for this room
    if (!this.gameLoops.has(client.roomCode)) {
      const loop = new GameLoop(
        (dt) => room.update(dt),
        () => this.broadcastGameState(client.roomCode!)
      );
      this.gameLoops.set(client.roomCode, loop);
      loop.start();
    }

    // Broadcast room update (phase changed)
    this.broadcastToRoom(client.roomCode, { type: 'room_update', room: room.getRoomInfo() });
  }

  private broadcastGameState(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const state = room.getState();

    for (const [ws, client] of this.clients) {
      if (client.roomCode === roomCode) {
        const message: ServerMessage = {
          type: 'game_state',
          state,
          yourShipId: client.type === 'controller' ? client.id : undefined,
        };
        this.send(ws, message);
      }
    }
  }

  private leaveRoom(client: Client): void {
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (room) {
      room.removePlayer(client.id);
      this.broadcastToRoom(client.roomCode, { type: 'room_update', room: room.getRoomInfo() });

      // Clean up empty rooms
      if (room.isEmpty()) {
        const loop = this.gameLoops.get(client.roomCode);
        if (loop) {
          loop.stop();
          this.gameLoops.delete(client.roomCode);
        }
        this.rooms.delete(client.roomCode);
        console.log(`Room ${client.roomCode} deleted (empty)`);
      }
    }
    client.roomCode = null;
  }

  private handleDisconnect(client: Client): void {
    console.log(`Client disconnected: ${client.id}`);
    this.leaveRoom(client);
    this.clients.delete(client.ws);
  }

  private broadcastToRoom(roomCode: string, message: ServerMessage): void {
    for (const [ws, client] of this.clients) {
      if (client.roomCode === roomCode) {
        this.send(ws, message);
      }
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Omit I, O
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Start server
new GameServer(SERVER_PORT);
