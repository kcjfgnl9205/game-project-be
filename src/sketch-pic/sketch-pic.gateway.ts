import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { RoomStatus } from '@prisma/client';
import type { Socket } from 'socket.io';
import { RoomsService } from '../rooms/rooms.service';
import {
  BaseGameGateway,
  identityKey,
  type BasePlayer,
} from '../game-common/base-game.gateway';
import {
  SketchPicState,
  SketchPicStateService,
  Player,
  WordChoice,
} from './sketch-pic-state.service';
import { SketchPicService, TurnStatEntry } from './sketch-pic.service';

const SELECT_TIMEOUT_MS = 10_000; // 출제어 미선택 시 자동 선택

@WebSocketGateway({
  namespace: '/sketch-pic',
  cors: { origin: true, credentials: true }, // TODO(prod): CORS_ORIGINS로 제한
})
export class SketchPicGateway extends BaseGameGateway<SketchPicState> {
  constructor(
    private readonly gameState: SketchPicStateService,
    private readonly service: SketchPicService,
    rooms: RoomsService,
    jwt: JwtService,
  ) {
    super(rooms, jwt);
  }

  // ===== 베이스 추상 구현 =====

  protected async loadState(roomId: string): Promise<SketchPicState> {
    let room = await this.service.getRoomContext(roomId);
    for (let i = 0; i < 3 && !room; i++) {
      await new Promise((r) => setTimeout(r, 100));
      room = await this.service.getRoomContext(roomId);
    }
    if (!room) throw new Error('방을 찾을 수 없습니다');

    const hostKey = room.hostUserId
      ? identityKey('user', room.hostUserId)
      : room.hostGuestId
        ? identityKey('guest', room.hostGuestId)
        : null;

    return this.gameState.getOrCreate(
      roomId,
      room.sketchPicConfig?.drawTimeSec ?? 60,
      hostKey,
    );
  }

  protected getState(roomId: string): SketchPicState | undefined {
    return this.gameState.get(roomId);
  }

  protected deleteState(roomId: string): void {
    this.gameState.delete(roomId);
  }

  protected snapshot(state: SketchPicState): unknown {
    return this.gameState.lobbySnapshot(state);
  }

  // 참가자 등록: 턴 순서 추가 + 회원 최초 입장 시 playCount +1
  protected onPlayerAdded(state: SketchPicState, player: BasePlayer): void {
    if (!state.turnOrder.includes(player.key)) state.turnOrder.push(player.key);
    if (player.type === 'user' && !state.countedMembers.has(player.key)) {
      state.countedMembers.add(player.key);
      void this.service.incrementPlayCount(player.id).catch(() => undefined);
    }
  }

  // 입장 직후: 지금까지 그려진 내용을 새 클라이언트에게 재생 (중간 입장자도 전부 봄)
  protected onJoined(state: SketchPicState, client: Socket): void {
    for (const batch of state.strokes) {
      client.emit('draw:stroke', batch);
    }
  }

  // (유예 후) 실제 퇴장 처리
  protected onPlayerLeft(state: SketchPicState, key: string): void {
    state.turnOrder = state.turnOrder.filter((k) => k !== key);
    if (state.phase !== 'LOBBY' && state.players.size < 2) {
      void this.stopGame(state, 'not_enough_players');
    } else if (
      state.currentDrawerKey === key &&
      (state.phase === 'DRAWING' || state.phase === 'WORD_SELECT')
    ) {
      void this.endTurn(state, 'drawer_left');
    } else {
      this.emitLobby(state);
    }
  }

  // 채팅 후처리: 출제자가 아니고 아직 못 맞힌 사람이 정답을 맞혔는지 판정
  protected onChat(
    state: SketchPicState,
    player: BasePlayer,
    text: string,
  ): void {
    const isCorrect =
      state.phase === 'DRAWING' &&
      player.key !== state.currentDrawerKey &&
      !state.solved.has(player.key) &&
      !!state.word &&
      this.normalize(text) === this.normalize(state.word);
    if (isCorrect) this.handleCorrect(state, player);
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
    state.strokes.push(body); // 중간 입장자 재생용으로 누적 저장
    client.to(state.roomId).emit('draw:stroke', body);
  }

  @SubscribeMessage('draw:clear')
  onClear(@ConnectedSocket() client: Socket): void {
    const state = this.stateOf(client);
    if (!state || state.phase !== 'DRAWING') return;
    if (this.keyOf(client) !== state.currentDrawerKey) return;
    state.strokes = []; // 전체 지우기 → 누적 그림도 비움
    client.to(state.roomId).emit('draw:clear');
  }

  // ===== 게임 흐름 =====

  private async startGame(state: SketchPicState): Promise<void> {
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

  private async beginTurn(state: SketchPicState): Promise<void> {
    this.gameState.clearTimers(state);
    if (state.players.size < 2)
      return this.stopGame(state, 'not_enough_players');

    state.currentDrawerKey = this.gameState.nextDrawerKey(state);
    state.phase = 'WORD_SELECT';
    state.word = null;
    state.solved = new Set();
    state.turnScores = new Map();
    state.strokes = []; // 새 턴 → 캔버스 초기화(클라도 출제자 변경 시 clear)

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

    state.selectTimer = setTimeout(() => {
      const pick = choices[Math.floor(Math.random() * choices.length)];
      this.startDrawing(state, pick);
    }, SELECT_TIMEOUT_MS);
  }

  private startDrawing(state: SketchPicState, choice: WordChoice): void {
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

  private handleCorrect(state: SketchPicState, player: Player): void {
    const order = state.solved.size; // 앞서 맞힌 사람 수
    const elapsedSec = (Date.now() - state.turnStartedAt) / 1000;
    const base = Math.max(10, Math.round(100 - elapsedSec * 2));
    const bonus = Math.max(0, 20 - 5 * order); // 1등 +20, 2등 +15 ...
    const gain = base + bonus;

    state.solved.add(player.key);
    this.gameState.addScore(state, player.key, gain); // 맞힌 사람만 가점

    this.server.to(state.roomId).emit('guess:correct', {
      playerId: player.key,
      nickname: player.nickname,
      scoreDelta: gain,
    });
    this.emitSystemChat(state, `${player.nickname}님이 정답입니다!`);

    void this.endTurn(state, 'correct');
  }

  private async endTurn(state: SketchPicState, reason: string): Promise<void> {
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
    // 정답 공개를 채팅 로그에도 남긴다.
    if (reason === 'drawer_left') {
      this.emitSystemChat(state, '출제자가 나가 턴이 종료되었습니다.');
    } else if (word) {
      this.emitSystemChat(state, `정답은 "${word}" 입니다.`);
    }

    // 대기 없이 곧바로 다음 턴(다음 출제자 단어 선택)으로 넘어간다.
    void this.beginTurn(state);
  }

  private async stopGame(state: SketchPicState, reason: string): Promise<void> {
    this.gameState.clearTimers(state);
    state.phase = 'LOBBY';
    state.currentDrawerKey = null;
    state.word = null;
    state.wordChoices = [];
    state.solved = new Set();
    state.turnScores = new Map();
    state.strokes = [];
    await this.service.setRoomStatus(state.roomId, RoomStatus.WAITING);
    this.server.to(state.roomId).emit('game:stopped', { reason });
    this.emitLobby(state);
  }

  // ===== 헬퍼 =====

  private normalize(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, '');
  }

  private mapToObj(map: Map<string, number>): Record<string, number> {
    return Object.fromEntries(map);
  }
}
