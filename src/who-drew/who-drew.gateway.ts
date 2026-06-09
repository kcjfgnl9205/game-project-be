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
import { BaseGameGateway, identityKey } from '../game-common/base-game.gateway';
import {
  WhoDrewState,
  WhoDrewStateService,
  Player,
} from './who-drew-state.service';
import { WhoDrewService } from './who-drew.service';

const MIN_PLAYERS = 4; // 마피아 1 + 일반인 ≥3
const VOTE_TIME_MS = 30_000;

@WebSocketGateway({
  namespace: '/who-drew',
  cors: { origin: true, credentials: true }, // TODO(prod): CORS_ORIGINS로 제한
})
export class WhoDrewGateway extends BaseGameGateway<WhoDrewState> {
  constructor(
    private readonly gameState: WhoDrewStateService,
    private readonly service: WhoDrewService,
    rooms: RoomsService,
    jwt: JwtService,
  ) {
    super(rooms, jwt);
  }

  // ===== 베이스 추상 구현 =====

  protected async loadState(roomId: string): Promise<WhoDrewState> {
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

    const cfg = room.whoDrewConfig;
    return this.gameState.getOrCreate(
      roomId,
      { rounds: cfg?.rounds ?? 5, turnTimeSec: cfg?.turnTimeSec ?? 20 },
      hostKey,
    );
  }

  protected getState(roomId: string): WhoDrewState | undefined {
    return this.gameState.get(roomId);
  }

  protected deleteState(roomId: string): void {
    this.gameState.delete(roomId);
  }

  protected snapshot(state: WhoDrewState): unknown {
    return this.gameState.lobbySnapshot(state);
  }

  // 입장 직후: 진행 중이면 공유 캔버스 히스토리 + (참가자였다면) 역할/단어 재전송
  protected onJoined(state: WhoDrewState, client: Socket, key: string): void {
    if (state.phase !== 'LOBBY') {
      client.emit('draw:history', { strokes: state.strokes });
      if (state.turnOrder.includes(key)) this.emitRole(state, client, key);
    }
  }

  // (유예 후) 실제 퇴장 처리
  protected onPlayerLeft(state: WhoDrewState, key: string): void {
    // 마피아가 진행 중 나가면 게임 성립 불가 → 즉시 라운드 종료 + 시민 승리
    if (
      state.mafiaKey === key &&
      (state.phase === 'DRAWING' || state.phase === 'VOTE')
    ) {
      void this.endRoundMafiaLeft(state);
      return;
    }
    const activePlaying = state.turnOrder.filter((k) =>
      state.players.has(k),
    ).length;
    if (state.phase !== 'LOBBY' && activePlaying < 2) {
      void this.stopGame(state, 'not_enough_players');
      return;
    }
    const wasCurrentTurn =
      state.phase === 'DRAWING' && this.gameState.currentTurnKey(state) === key;
    if (wasCurrentTurn) this.advanceTurn(state);
    else if (state.phase === 'VOTE') this.maybeFinishVote(state);
    else this.emitLobby(state);
  }

  // ===== 호스트 제어 =====

  @SubscribeMessage('game:start')
  onStart(@ConnectedSocket() client: Socket): void {
    const state = this.stateOf(client);
    if (!state) return;
    if (this.keyOf(client) !== state.hostKey)
      return this.err(client, 'NOT_HOST', '호스트만 시작할 수 있습니다');
    if (state.phase === 'DRAWING' || state.phase === 'VOTE')
      return this.err(client, 'ALREADY_STARTED', '이미 진행 중입니다');
    if (state.players.size < MIN_PLAYERS)
      return this.err(
        client,
        'NEED_PLAYERS',
        `${MIN_PLAYERS}명 이상이어야 합니다`,
      );
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

  // ===== 그리기 (자기 차례에 1획) =====

  @SubscribeMessage('draw:stroke')
  onStroke(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { seg?: unknown },
  ): void {
    const state = this.stateOf(client);
    if (!state || state.phase !== 'DRAWING') return;
    const key = this.keyOf(client);
    if (key !== this.gameState.currentTurnKey(state)) return; // 자기 차례 아님

    state.strokes.push({ by: key, seg: body?.seg });
    client.to(state.roomId).emit('draw:stroke', { by: key, seg: body?.seg });
    this.advanceTurn(state); // 1획 그리면 자동으로 다음 차례
  }

  // 그리는 도중 실시간 중계 (저장/턴 넘김 없음 — 다른 사람 화면에만 미리보기).
  // commit(draw:stroke) 시 전체 획을 다시 보내므로 동일 픽셀이 덧그려져도 무방.
  @SubscribeMessage('draw:live')
  onLive(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { seg?: unknown },
  ): void {
    const state = this.stateOf(client);
    if (!state || state.phase !== 'DRAWING') return;
    const key = this.keyOf(client);
    if (key !== this.gameState.currentTurnKey(state)) return; // 자기 차례 아님
    client.to(state.roomId).emit('draw:stroke', { by: key, seg: body?.seg });
  }

  // ===== 투표 =====

  @SubscribeMessage('vote:cast')
  onVote(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { targetKey?: string },
  ): void {
    const state = this.stateOf(client);
    if (!state || state.phase !== 'VOTE') return;
    const key = this.keyOf(client);
    if (!state.turnOrder.includes(key)) return; // 참가자만 투표
    const target = body?.targetKey;
    if (!target || !state.turnOrder.includes(target)) return;

    state.votes.set(key, target);
    this.server.to(state.roomId).emit('vote:update', {
      voted: state.votes.size,
      total: this.eligibleVoters(state).length,
    });
    this.maybeFinishVote(state);
  }

  // ===== 게임 흐름 =====

  private async startGame(state: WhoDrewState): Promise<void> {
    this.gameState.clearTimers(state);
    this.gameState.resetSession(state);

    const pair = await this.service.pickWordPair();
    if (!pair) {
      this.server.to(state.roomId).emit('error', {
        code: 'NO_WORDS',
        message: '등록된 단어쌍이 없습니다',
      });
      return;
    }

    state.turnOrder = this.shuffle([...state.players.keys()]);
    state.mafiaKey =
      state.turnOrder[Math.floor(Math.random() * state.turnOrder.length)];
    state.civilianWord = pair.civilianWord;
    state.mafiaWord = pair.mafiaWord;
    state.currentRound = 1;
    state.turnIndex = 0;
    state.phase = 'DRAWING';

    await this.service.setRoomStatus(state.roomId, RoomStatus.IN_GAME);
    this.server.to(state.roomId).emit('game:started', {
      rounds: state.rounds,
      turnOrder: state.turnOrder,
    });
    // 새 게임 → 모든 클라이언트의 공유 캔버스를 확실히 비운다.
    this.server.to(state.roomId).emit('draw:clear');

    // 각 플레이어에게 역할/단어 개인 전송
    for (const key of state.turnOrder) {
      const p = state.players.get(key);
      if (p) this.emitRole(state, this.server.to(p.socketId), key);
    }

    this.beginTurn(state);
  }

  // 현재 turnIndex의 차례 시작. 자리를 비운 사람은 건너뛴다.
  private beginTurn(state: WhoDrewState): void {
    this.gameState.clearTimers(state);

    // 현재 차례 플레이어가 없으면(이탈) 다음으로 — 무한루프 방지 가드.
    let guard = 0;
    while (
      guard++ < state.turnOrder.length &&
      !state.players.has(this.gameState.currentTurnKey(state) ?? '')
    ) {
      this.stepIndex(state);
      if (state.phase === 'VOTE') return; // 라운드 소진 → 투표로 넘어감
    }

    const turnKey = this.gameState.currentTurnKey(state);
    if (!turnKey) return void this.startVote(state);

    state.turnEndsAt = Date.now() + state.turnTimeSec * 1000;
    this.server.to(state.roomId).emit('turn:current', {
      turnKey,
      currentRound: state.currentRound,
      rounds: state.rounds,
      endsAt: state.turnEndsAt,
    });
    this.emitLobby(state);

    state.turnTimer = setTimeout(
      () => this.advanceTurn(state),
      state.turnTimeSec * 1000,
    );
  }

  // turnIndex를 한 칸 전진. 한 바퀴 돌면 라운드 증가, 라운드 소진 시 투표 전환.
  private stepIndex(state: WhoDrewState): void {
    state.turnIndex += 1;
    if (state.turnIndex >= state.turnOrder.length) {
      state.turnIndex = 0;
      state.currentRound += 1;
    }
    if (state.currentRound > state.rounds) {
      void this.startVote(state);
    }
  }

  private advanceTurn(state: WhoDrewState): void {
    if (state.phase !== 'DRAWING') return;
    this.gameState.clearTimers(state);
    this.stepIndex(state);
    if (state.phase === 'DRAWING') this.beginTurn(state);
  }

  private startVote(state: WhoDrewState): void {
    this.gameState.clearTimers(state);
    state.phase = 'VOTE';
    state.votes = new Map();
    state.turnEndsAt = Date.now() + VOTE_TIME_MS;

    const candidates = state.turnOrder
      .map((key) => state.players.get(key))
      .filter((p): p is Player => !!p)
      .map((p) => ({ key: p.key, nickname: p.nickname }));

    this.server.to(state.roomId).emit('vote:start', {
      candidates,
      endsAt: state.turnEndsAt,
    });
    this.emitLobby(state);

    state.voteTimer = setTimeout(
      () => void this.finishVote(state),
      VOTE_TIME_MS,
    );
  }

  private maybeFinishVote(state: WhoDrewState): void {
    if (state.phase !== 'VOTE') return;
    const voters = this.eligibleVoters(state);
    if (voters.length > 0 && voters.every((k) => state.votes.has(k))) {
      void this.finishVote(state);
    }
  }

  private async finishVote(state: WhoDrewState): Promise<void> {
    if (state.phase !== 'VOTE') return;
    this.gameState.clearTimers(state);
    state.phase = 'RESULT';

    // 득표 집계 → 최다 득표자(들). 동률이면 전원이 지목 대상으로 표시된다.
    const counts = new Map<string, number>();
    for (const target of state.votes.values()) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    let max = 0;
    for (const c of counts.values()) if (c > max) max = c;
    const accusedKeys =
      max > 0
        ? [...counts.entries()].filter(([, c]) => c === max).map(([k]) => k)
        : [];

    // 단독 지목된 사람이 마피아일 때만 시민 승리. 동률(여러 명)·미지목이면 마피아 승리.
    const winner =
      accusedKeys.length === 1 && accusedKeys[0] === state.mafiaKey
        ? 'CIVILIAN'
        : 'MAFIA';

    await this.service.setRoomStatus(state.roomId, RoomStatus.WAITING);
    this.server.to(state.roomId).emit('game:result', {
      mafiaKey: state.mafiaKey,
      civilianWord: state.civilianWord,
      mafiaWord: state.mafiaWord,
      accusedKeys,
      votes: Object.fromEntries(state.votes),
      winner,
    });
    this.emitLobby(state);
  }

  // 마피아 이탈로 라운드를 종료한다 (남은 시민 승리 처리).
  private async endRoundMafiaLeft(state: WhoDrewState): Promise<void> {
    this.gameState.clearTimers(state);
    state.phase = 'RESULT';
    await this.service.setRoomStatus(state.roomId, RoomStatus.WAITING);
    this.emitSystemChat(state, '마피아가 나가 시민 승리로 종료되었습니다.');
    this.server.to(state.roomId).emit('game:result', {
      mafiaKey: state.mafiaKey,
      civilianWord: state.civilianWord,
      mafiaWord: state.mafiaWord,
      accusedKeys: [],
      votes: {},
      winner: 'CIVILIAN',
    });
    this.emitLobby(state);
  }

  private async stopGame(state: WhoDrewState, reason: string): Promise<void> {
    this.gameState.clearTimers(state);
    state.phase = 'LOBBY';
    this.gameState.resetSession(state);
    state.turnOrder = [];
    await this.service.setRoomStatus(state.roomId, RoomStatus.WAITING);
    this.server.to(state.roomId).emit('game:stopped', { reason });
    this.emitLobby(state);
  }

  // ===== 헬퍼 =====

  private emitRole(
    state: WhoDrewState,
    target: { emit: (ev: string, payload: unknown) => void },
    key: string,
  ): void {
    const isMafia = key === state.mafiaKey;
    target.emit('role:info', {
      isMafia,
      word: isMafia ? state.mafiaWord : state.civilianWord,
    });
  }

  // turnOrder 중 현재 접속해 있는(투표 가능) 플레이어
  private eligibleVoters(state: WhoDrewState): string[] {
    return state.turnOrder.filter((k) => state.players.has(k));
  }

  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
