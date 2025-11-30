import type { PlayerInput, RoomInfo, GameState, GameMode } from './types';

// === CLIENT -> SERVER (Controller) ===

export interface JoinRoomMessage {
  type: 'join_room';
  roomCode: string;
  playerName: string;
}

export interface PlayerInputMessage {
  type: 'player_input';
  input: PlayerInput;
}

export interface LeaveRoomMessage {
  type: 'leave_room';
}

export interface SetGameModeMessage {
  type: 'set_game_mode';
  gameMode: GameMode;
}

// === CLIENT -> SERVER (Display) ===

export interface CreateRoomMessage {
  type: 'create_room';
}

export interface StartGameMessage {
  type: 'start_game';
}

export interface DisplayConnectMessage {
  type: 'display_connect';
  roomCode: string;
}

// === SERVER -> CLIENT ===

export interface RoomCreatedMessage {
  type: 'room_created';
  roomCode: string;
}

export interface RoomUpdateMessage {
  type: 'room_update';
  room: RoomInfo;
}

export interface GameStateMessage {
  type: 'game_state';
  state: GameState;
  yourShipId?: string; // Only sent to controllers
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export interface JoinedMessage {
  type: 'joined';
  playerId: string;
}

// === UNION TYPES ===

export type ClientMessage =
  | JoinRoomMessage
  | PlayerInputMessage
  | LeaveRoomMessage
  | SetGameModeMessage
  | CreateRoomMessage
  | StartGameMessage
  | DisplayConnectMessage;

export type ServerMessage =
  | RoomCreatedMessage
  | RoomUpdateMessage
  | GameStateMessage
  | ErrorMessage
  | JoinedMessage;
