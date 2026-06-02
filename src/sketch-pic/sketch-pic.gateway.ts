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
const START_DELAY_MS = 2_000; // 2명 이상 입장 시 자동 시작 대기
const MAX_CHAT_LEN = 200;
// 소켓 끊김 후 DB 참가자 정리(빈 방 삭제)까지의 유예 시간.
// 새로고침·네트워크 끊김·dev 서버 재시작 등 일시적 단절에서 방이 사라지지 않도록
// 지연시킨다. 재접속하면 취소된다. (재시작 시엔 타이머가 프로세스와 함께 사라져
// rooms.leave가 실행되지 않으므로 방이 보존된다.)
const LEAVE_GRACE_MS = 30_000;

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

  // `${roomId}:${key}` -> 유예 중인 DB leave 타이머. 재접속 시 취소한다.
  private readonly leaveTimers = new Map<string, NodeJS.Timeout>();

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
      console.log('[SketchPicGateway] handleConnection:', {
        roomId,
        authKeys: Object.keys(auth),
      });
      if (!roomId) throw new Error('roomId가 필요합니다');

      const { type, id } = this.resolveIdentity(auth);
      console.log('[SketchPicGateway] resolveIdentity:', { type, id });

      // 방 생성 후 DB 동기화 대기 (재시도)
      let room = await this.service.getRoomContext(roomId);
      if (!room) {
        console.log(
          '[SketchPicGateway] room not found on first try, retrying...',
        );
        // 재시도: 최대 3회, 100ms 간격
        for (let i = 0; i < 3 && !room; i++) {
          await new Promise((r) => setTimeout(r, 100));
          room = await this.service.getRoomContext(roomId);
          console.log(
            `[SketchPicGateway] retry ${i + 1}:`,
            room ? 'found' : 'not found',
          );
        }
      }
      if (!room) throw new Error('방을 찾을 수 없습니다');
      console.log('[SketchPicGateway] room found:', {
        id: room.id,
        gameType: room.gameType,
      });

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
      this.cancelLeave(roomId, key); // 유예 중이던 퇴장 정리 취소 (재접속)
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
      if (state.phase === 'LOBBY' && state.players.size >= 2) {
        this.scheduleStart(state);
      }
    } catch (e) {
      client.emit('error', {
        code: 'CONNECT_FAILED',
        message: e instanceof Error ? e.message : '연결 실패',
      });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
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

    // DB 참가자 정리 (호스트 위임 / 빈 방 삭제)는 유예 후 실행한다.
    // 일시적 단절(새로고침·재시작·네트워크)로 방이 즉시 삭제되는 것을 막고,
    // 재접속 시 handleConnection에서 취소한다.
    this.scheduleLeave(data.roomId, player);

    if (state.players.size === 0) {
      this.gameState.delete(data.roomId);
      return;
    }

    if (state.phase === 'LOBBY') {
      if (state.players.size < 2) {
        if (state.startTimer) {
          clearTimeout(state.startTimer);
          state.startTimer = null;
          state.startAt = null;
        }
      } else {
        this.scheduleStart(state);
      }
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

    // 맞히는 사람(출제자 아님, 아직 못 맞힘)이 정답을 맞혔는지.
    // 출제자는 정답을 입력해도 정답 처리되지 않는다.
    const isCorrect =
      state.phase === 'DRAWING' &&
      key !== state.currentDrawerKey &&
      !state.solved.has(key) &&
      !!state.word &&
      this.normalize(text) === this.normalize(state.word);

    // 모든 채팅은 방 전체에 그대로 방송한다 (출제자/정답 포함).
    this.server.to(state.roomId).emit('chat:message', {
      senderId: key,
      nickname: player.nickname,
      text,
      ts: Date.now(),
    });

    // 정답이면 점수/턴 처리.
    if (isCorrect) {
      this.handleCorrect(state, player);
    }
  }

  // ===== 게임 흐름 =====

  private async startGame(state: GameState): Promise<void> {
    console.debug('[sketch-pic] startGame:', state.roomId);
    this.gameState.clearTimers(state);
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
    console.debug(
      '[sketch-pic] beginTurn:',
      state.roomId,
      'players=',
      state.players.size,
    );
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
      endsAt: Date.now() + SELECT_TIMEOUT_MS,
    });
    console.debug('[sketch-pic] emitted turn:choosing', {
      roomId: state.roomId,
      drawer: state.currentDrawerKey,
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
    this.emitSystemChat(
      state,
      `${drawer?.nickname ?? '출제자'}님이 그림을 시작합니다.`,
    );

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
    this.emitSystemChat(state, `${player.nickname}님이 정답입니다!`);

    void this.endTurn(state, 'correct');
  }

  private async endTurn(state: GameState, reason: string): Promise<void> {
    if (state.phase === 'REVEAL') return; // 중복 방지
    console.debug('[sketch-pic] endTurn:', state.roomId, 'reason=', reason);
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
    // 정답 공개를 채팅 로그에도 남긴다.
    if (reason === 'drawer_left') {
      this.emitSystemChat(state, '출제자가 나가 턴이 종료되었습니다.');
    } else if (word) {
      this.emitSystemChat(state, `정답은 "${word}" 입니다.`);
    }
    console.debug('[sketch-pic] emitted turn:reveal', {
      roomId: state.roomId,
      reason,
    });

    // 대기 없이 곧바로 다음 턴(다음 출제자 단어 선택)으로 넘어간다.
    void this.beginTurn(state);
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

  // 끊긴 참가자의 DB 정리를 유예 후 실행한다 (재접속하면 cancelLeave로 취소).
  // REST join 없이 소켓만 붙은 경우 참가 기록이 없어 NotFound → 무시.
  private scheduleLeave(roomId: string, player: Player): void {
    const id = `${roomId}:${player.key}`;
    const existing = this.leaveTimers.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.leaveTimers.delete(id);
      void this.rooms
        .leave(roomId, this.toIdentity(player))
        .catch(() => undefined);
    }, LEAVE_GRACE_MS);
    this.leaveTimers.set(id, timer);
  }

  private cancelLeave(roomId: string, key: string): void {
    const id = `${roomId}:${key}`;
    const timer = this.leaveTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.leaveTimers.delete(id);
    }
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

  // 진행 안내(그림 시작/정답/정답 공개)를 채팅 로그에 시스템 메시지로 남긴다.
  private emitSystemChat(state: GameState, text: string): void {
    this.server.to(state.roomId).emit('chat:system', { text, ts: Date.now() });
  }

  private err(client: Socket, code: string, message: string): void {
    client.emit('error', { code, message });
  }

  private scheduleStart(state: GameState): void {
    if (state.startTimer) return;
    state.startAt = Date.now() + START_DELAY_MS;
    this.server
      .to(state.roomId)
      .emit('game:starting', { startsAt: state.startAt });
    state.startTimer = setTimeout(async () => {
      state.startTimer = null;
      state.startAt = null;
      if (state.phase !== 'LOBBY' || state.players.size < 2) return;
      await this.startGame(state);
    }, START_DELAY_MS);
  }

  private normalize(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, '');
  }

  private mapToObj(map: Map<string, number>): Record<string, number> {
    return Object.fromEntries(map);
  }
}
