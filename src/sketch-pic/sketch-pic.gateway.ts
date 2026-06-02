import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { RoomStatus, UserRole } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { RoomsService } from '../rooms/rooms.service';
import type { Identity } from '../auth/decorators/identity.decorator';
import {
  GameState,
  GameStateService,
  identityKey,
  Player,
  PlayerType,
  WordChoice,
} from './game-state.service';
import { SketchPicService, TurnStatEntry } from './sketch-pic.service';

const SELECT_TIMEOUT_MS = 10_000; // 출제어 미선택 시 자동 선택
const REVEAL_MS = 4_000; // 정답 공개 후 다음 턴까지 대기
const MAX_CHAT_LEN = 200;

interface SocketData {
  roomId: string;
  key: string;
}

interface JwtPayload {
  sub: string;
  role: UserRole;
}

@WebSocketGateway({
  namespace: '/sketch-pic',
  cors: { origin: true, credentials: true }, // TODO(prod): CORS_ORIGINS로 제한
})
export class SketchPicGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;

  constructor(
    private readonly gameState: GameStateService,
    private readonly service: SketchPicService,
    private readonly rooms: RoomsService,
    private readonly jwt: JwtService,
  ) {}

  // ===== 연결 / 해제 =====

  async handleConnection(client: Socket): Promise<void> {
    try {
      const auth = (client.handshake.auth ?? {}) as Record<string, string>;
      const roomId = auth.roomId;
      if (!roomId) throw new Error('roomId가 필요합니다');

      const { type, id } = this.resolveIdentity(auth);
      const room = await this.service.getRoomContext(roomId);
      if (!room) throw new Error('방을 찾을 수 없습니다');

      const hostKey = room.hostUserId
        ? identityKey('user', room.hostUserId)
        : room.hostGuestId
          ? identityKey('guest', room.hostGuestId)
          : null;

      const state = this.gameState.getOrCreate(
        roomId,
        room.sketchPicConfig?.drawTimeSec ?? 60,
        hostKey,
      );

      const key = identityKey(type, id);
      const player: Player = {
        key,
        type,
        id,
        nickname: (auth.nickname ?? '').trim() || '플레이어',
        socketId: client.id,
      };
      state.players.set(key, player);
      if (!state.turnOrder.includes(key)) state.turnOrder.push(key); // 진행 중이면 다음 턴부터 참여

      (client.data as SocketData) = { roomId, key };
      await client.join(roomId);

      // 회원 최초 입장 시 playCount +1
      if (type === 'user' && !state.countedMembers.has(key)) {
        state.countedMembers.add(key);
        await this.service.incrementPlayCount(id).catch(() => undefined);
      }

      this.emitLobby(state);
    } catch (e) {
      client.emit('error', {
        code: 'CONNECT_FAILED',
        message: e instanceof Error ? e.message : '연결 실패',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as SocketData | undefined;
    if (!data?.roomId) return;
    const state = this.gameState.get(data.roomId);
    if (!state) return;

    const player = state.players.get(data.key);
    if (!player || player.socketId !== client.id) return; // 재연결로 교체된 stale 소켓

    const wasDrawer = state.currentDrawerKey === data.key;
    const wasHost = state.hostKey === data.key;
    state.players.delete(data.key);
    state.turnOrder = state.turnOrder.filter((k) => k !== data.key);

    // DB 참가자 정리 (REST leave와 동일: 호스트 위임 / 빈 방 삭제).
    // REST join 없이 소켓만 붙은 경우 참가 기록이 없어 NotFound → 무시.
    void this.rooms
      .leave(data.roomId, this.toIdentity(player))
      .catch(() => undefined);

    if (state.players.size === 0) {
      this.gameState.delete(data.roomId);
      return;
    }

    // 호스트 이탈 → 다음 사람에게 위임 (인메모리)
    if (wasHost) {
      state.hostKey = state.turnOrder[0] ?? null;
    }

    if (state.phase !== 'LOBBY' && state.players.size < 2) {
      void this.stopGame(state, 'not_enough_players');
    } else if (
      wasDrawer &&
      (state.phase === 'DRAWING' || state.phase === 'WORD_SELECT')
    ) {
      void this.endTurn(state, 'drawer_left');
    } else {
      this.emitLobby(state);
    }
  }

  // ===== 호스트 제어 =====

  @SubscribeMessage('game:start')
  onStart(@ConnectedSocket() client: Socket): void {
    const state = this.stateOf(client);
    if (!state) return;
    if (this.keyOf(client) !== state.hostKey)
      return this.err(client, 'NOT_HOST', '호스트만 시작할 수 있습니다');
    if (state.phase !== 'LOBBY')
      return this.err(client, 'ALREADY_STARTED', '이미 진행 중입니다');
    if (state.players.size < 2)
      return this.err(client, 'NEED_2_PLAYERS', '2명 이상이어야 합니다');
    void this.startGame(state);
  }

  @SubscribeMessage('game:stop')
  onStop(@ConnectedSocket() client: Socket): void {
    const state = this.stateOf(client);
    if (!state) return;
    if (this.keyOf(client) !== state.hostKey)
      return this.err(client, 'NOT_HOST', '호스트만 중단할 수 있습니다');
    void this.stopGame(state, 'host_stopped');
  }

  @SubscribeMessage('word:pick')
  onPick(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { word?: string },
  ): void {
    const state = this.stateOf(client);
    if (!state) return;
    if (this.keyOf(client) !== state.currentDrawerKey)
      return this.err(client, 'NOT_DRAWER', '출제자가 아닙니다');
    if (state.phase !== 'WORD_SELECT')
      return this.err(client, 'NOT_SELECTING', '단어 선택 단계가 아닙니다');
    const choice = state.wordChoices.find((c) => c.word === body?.word);
    if (!choice)
      return this.err(client, 'INVALID_WORD', '후보에 없는 단어입니다');
    this.startDrawing(state, choice);
  }

  // ===== 그리기 relay =====

  @SubscribeMessage('draw:stroke')
  onStroke(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): void {
    const state = this.stateOf(client);
    if (!state || state.phase !== 'DRAWING') return;
    if (this.keyOf(client) !== state.currentDrawerKey) return;
    client.to(state.roomId).emit('draw:stroke', body);
  }

  @SubscribeMessage('draw:clear')
  onClear(@ConnectedSocket() client: Socket): void {
    const state = this.stateOf(client);
    if (!state || state.phase !== 'DRAWING') return;
    if (this.keyOf(client) !== state.currentDrawerKey) return;
    client.to(state.roomId).emit('draw:clear');
  }

  // ===== 채팅 / 정답 =====

  @SubscribeMessage('chat:send')
  onChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { text?: string },
  ): void {
    const state = this.stateOf(client);
    if (!state) return;
    const key = this.keyOf(client);
    const player = state.players.get(key);
    if (!player) return;

    const text = String(body?.text ?? '').slice(0, MAX_CHAT_LEN);
    if (!text.trim()) return;

    const isGuesser =
      state.phase === 'DRAWING' &&
      key !== state.currentDrawerKey &&
      !state.solved.has(key);

    if (
      isGuesser &&
      state.word &&
      this.normalize(text) === this.normalize(state.word)
    ) {
      this.handleCorrect(state, player);
      return;
    }

    // 출제자가 정답 단어를 흘리는 것 방지
    if (
      state.phase === 'DRAWING' &&
      state.word &&
      this.normalize(text) === this.normalize(state.word)
    ) {
      return;
    }

    this.server.to(state.roomId).emit('chat:message', {
      senderId: key,
      nickname: player.nickname,
      text,
      ts: Date.now(),
    });
  }

  // ===== 게임 흐름 =====

  private async startGame(state: GameState): Promise<void> {
    state.turnOrder = [...state.players.keys()];
    state.currentDrawerKey = null;
    state.turnCount = 0;
    state.usedWordIds = new Set();
    state.sessionScores = new Map();
    await this.service.setRoomStatus(state.roomId, RoomStatus.IN_GAME);
    this.server
      .to(state.roomId)
      .emit('game:started', { turnOrder: state.turnOrder });
    await this.beginTurn(state);
  }

  private async beginTurn(state: GameState): Promise<void> {
    this.gameState.clearTimers(state);
    if (state.players.size < 2)
      return this.stopGame(state, 'not_enough_players');

    state.currentDrawerKey = this.gameState.nextDrawerKey(state);
    state.phase = 'WORD_SELECT';
    state.word = null;
    state.solved = new Set();
    state.turnScores = new Map();

    const choices = await this.service.pickWordChoices(state.usedWordIds, 3);
    if (choices.length === 0) {
      this.server
        .to(state.roomId)
        .emit('error', { code: 'NO_WORDS', message: '등록된 단어가 없습니다' });
      return this.stopGame(state, 'no_words');
    }
    state.wordChoices = choices;

    const drawer = state.currentDrawerKey
      ? state.players.get(state.currentDrawerKey)
      : undefined;
    if (drawer) {
      this.server
        .to(drawer.socketId)
        .emit('word:choices', { words: choices.map((c) => c.word) });
    }
    this.server.to(state.roomId).emit('turn:choosing', {
      drawerId: state.currentDrawerKey,
      turnCount: state.turnCount + 1,
    });

    state.selectTimer = setTimeout(() => {
      const pick = choices[Math.floor(Math.random() * choices.length)];
      this.startDrawing(state, pick);
    }, SELECT_TIMEOUT_MS);
  }

  private startDrawing(state: GameState, choice: WordChoice): void {
    this.gameState.clearTimers(state);
    state.usedWordIds.add(choice.id);
    state.word = choice.word;
    state.phase = 'DRAWING';
    state.turnCount += 1;
    state.solved = new Set();
    state.turnScores = new Map();
    state.turnStartedAt = Date.now();

    const endsAt = state.turnStartedAt + state.drawTimeSec * 1000;
    this.server.to(state.roomId).emit('turn:start', {
      drawerId: state.currentDrawerKey,
      turnCount: state.turnCount,
      wordLength: choice.word.length,
      endsAt,
    });
    const drawer = state.currentDrawerKey
      ? state.players.get(state.currentDrawerKey)
      : undefined;
    if (drawer) {
      this.server.to(drawer.socketId).emit('turn:word', { word: choice.word });
    }

    state.turnTimer = setTimeout(
      () => void this.endTurn(state, 'timeout'),
      state.drawTimeSec * 1000,
    );
  }

  private handleCorrect(state: GameState, player: Player): void {
    const order = state.solved.size; // 앞서 맞힌 사람 수
    const elapsedSec = (Date.now() - state.turnStartedAt) / 1000;
    const base = Math.max(10, Math.round(100 - elapsedSec * 2));
    const bonus = Math.max(0, 20 - 5 * order); // 1등 +20, 2등 +15 ...
    const gain = base + bonus;

    state.solved.add(player.key);
    this.gameState.addScore(state, player.key, gain);
    if (state.currentDrawerKey) {
      this.gameState.addScore(state, state.currentDrawerKey, 25); // 출제자 보상
    }

    this.server.to(state.roomId).emit('guess:correct', {
      playerId: player.key,
      nickname: player.nickname,
      scoreDelta: gain,
    });

    // 출제자 제외 전원 정답이면 조기 종료
    const guessers = state.turnOrder.filter(
      (k) => k !== state.currentDrawerKey && state.players.has(k),
    );
    if (guessers.length > 0 && guessers.every((k) => state.solved.has(k))) {
      void this.endTurn(state, 'all_solved');
    }
  }

  private async endTurn(state: GameState, reason: string): Promise<void> {
    if (state.phase === 'REVEAL') return; // 중복 방지
    this.gameState.clearTimers(state);
    const word = state.word;
    state.phase = 'REVEAL';

    // 통계 증분 (회원만)
    const statKeys = new Set<string>([...state.solved]);
    if (state.currentDrawerKey) statKeys.add(state.currentDrawerKey);
    const entries: TurnStatEntry[] = [];
    for (const key of statKeys) {
      const p = state.players.get(key);
      if (!p || p.type !== 'user') continue;
      const isDrawer = key === state.currentDrawerKey;
      entries.push({
        userId: p.id,
        correct: !isDrawer && state.solved.has(key) ? 1 : 0,
        draw: isDrawer ? 1 : 0,
        score: state.turnScores.get(key) ?? 0,
      });
    }
    await this.service.applyTurnStats(entries).catch(() => undefined);

    this.server.to(state.roomId).emit('turn:reveal', {
      word,
      reason,
      turnScores: this.mapToObj(state.turnScores),
      sessionScores: this.gameState.scoreboard(state),
    });

    state.turnTimer = setTimeout(() => void this.beginTurn(state), REVEAL_MS);
  }

  private async stopGame(state: GameState, reason: string): Promise<void> {
    this.gameState.clearTimers(state);
    state.phase = 'LOBBY';
    state.currentDrawerKey = null;
    state.word = null;
    state.wordChoices = [];
    state.solved = new Set();
    state.turnScores = new Map();
    await this.service.setRoomStatus(state.roomId, RoomStatus.WAITING);
    this.server.to(state.roomId).emit('game:stopped', { reason });
    this.emitLobby(state);
  }

  // ===== 헬퍼 =====

  private resolveIdentity(auth: Record<string, string>): {
    type: PlayerType;
    id: string;
  } {
    if (auth.token) {
      const payload = this.jwt.verify<JwtPayload>(auth.token, {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      });
      return { type: 'user', id: payload.sub };
    }
    if (auth.guestId) {
      return { type: 'guest', id: auth.guestId };
    }
    throw new Error('인증 정보(token 또는 guestId)가 필요합니다');
  }

  private toIdentity(player: Player): Identity {
    return player.type === 'user'
      ? { type: 'user', id: player.id, role: UserRole.USER }
      : { type: 'guest', id: player.id };
  }

  private stateOf(client: Socket): GameState | undefined {
    const data = client.data as SocketData | undefined;
    return data?.roomId ? this.gameState.get(data.roomId) : undefined;
  }

  private keyOf(client: Socket): string {
    return (client.data as SocketData).key;
  }

  private emitLobby(state: GameState): void {
    this.server
      .to(state.roomId)
      .emit('lobby:state', this.gameState.lobbySnapshot(state));
  }

  private err(client: Socket, code: string, message: string): void {
    client.emit('error', { code, message });
  }

  private normalize(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, '');
  }

  private mapToObj(map: Map<string, number>): Record<string, number> {
    return Object.fromEntries(map);
  }
}
