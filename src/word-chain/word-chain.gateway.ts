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
import { WordChainStateService, WordChainState } from './word-chain-state.service';
import { WordChainService } from './word-chain.service';
import { allowedStarts, isValidHangulWord } from './hangul';

const MIN_PLAYERS = 2;
const ROUND_GAP_MS = 4_000; // 라운드 사이 결과 노출 시간

@WebSocketGateway({
  namespace: '/word-chain',
  cors: { origin: true, credentials: true },
})
export class WordChainGateway extends BaseGameGateway<WordChainState> {
  constructor(
    private readonly gameState: WordChainStateService,
    private readonly service: WordChainService,
    rooms: RoomsService,
    jwt: JwtService,
  ) {
    super(rooms, jwt);
  }

  // ===== 베이스 추상 구현 =====

  protected async loadState(roomId: string): Promise<WordChainState> {
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

    const cfg = room.wordChainConfig;
    return this.gameState.getOrCreate(
      roomId,
      {
        mode: cfg?.mode ?? 'ROUND',
        roundCount: cfg?.roundCount ?? 3,
        turnTimeSec: cfg?.turnTimeSec ?? 15,
        allowKillerWord: cfg?.allowKillerWord ?? false,
      },
      hostKey,
    );
  }

  protected getState(roomId: string): WordChainState | undefined {
    return this.gameState.get(roomId);
  }
  protected deleteState(roomId: string): void {
    this.gameState.delete(roomId);
  }
  protected snapshot(state: WordChainState): unknown {
    return this.gameState.lobbySnapshot(state);
  }

  // (유예 후) 실제 퇴장: 진행 중이면 탈락 처리, 인원 부족이면 중단.
  protected onPlayerLeft(state: WordChainState, key: string): void {
    if (state.phase !== 'PLAYING') {
      this.emitLobby(state);
      return;
    }
    if (state.players.size < MIN_PLAYERS) {
      this.abort(state, '플레이어가 부족하여 대기 상태로 돌아갑니다.');
      return;
    }
    if (state.alive.includes(key)) {
      this.eliminate(state, key, true);
    } else {
      this.emitLobby(state);
    }
  }

  // ===== 게임 시작 =====

  @SubscribeMessage('game:start')
  onStart(@ConnectedSocket() client: Socket): void {
    const state = this.stateOf(client);
    if (!state) return;
    const key = this.keyOf(client);
    if (key !== state.hostKey) return this.err(client, 'NOT_HOST', '방장만 시작할 수 있습니다.');
    if (state.phase === 'PLAYING') return;
    if (state.players.size < MIN_PLAYERS)
      return this.err(client, 'NOT_ENOUGH', `최소 ${MIN_PLAYERS}명이 필요합니다.`);

    this.gameState.resetSession(state);
    state.order = [...state.players.keys()];
    state.players.forEach((_, k) => state.wins.set(k, 0));
    this.beginRound(state);
  }

  // ===== 라운드 시작 =====

  private beginRound(state: WordChainState): void {
    this.gameState.clearTimers(state);
    state.round += 1;
    // 현재 접속 중인 참가자만 생존자로 (퇴장자 제외), 시작 순서 유지
    state.alive = state.order.filter((k) => state.players.has(k));
    state.usedWords = new Set();
    state.lastWord = null;
    state.requiredStarts = null;
    state.phase = 'PLAYING';
    void this.service.setRoomStatus(state.roomId, RoomStatus.IN_GAME);

    // 라운드마다 시작 플레이어 회전
    const startKey = state.alive[(state.round - 1) % state.alive.length] ?? state.alive[0];
    this.emitSystemChat(state, `${state.round}라운드 시작! 첫 단어를 입력하세요.`);
    this.startTurn(state, startKey ?? null);
  }

  private startTurn(state: WordChainState, key: string | null): void {
    if (state.turnTimer) clearTimeout(state.turnTimer);
    state.currentKey = key;
    state.turnEndsAt = Date.now() + state.turnTimeSec * 1000;
    state.turnTimer = setTimeout(
      () => this.onTimeout(state.roomId),
      state.turnTimeSec * 1000,
    );
    this.emitLobby(state);
  }

  private onTimeout(roomId: string): void {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'PLAYING' || !state.currentKey) return;
    const p = state.players.get(state.currentKey);
    this.emitSystemChat(state, `${p?.nickname ?? '플레이어'}님이 시간 초과로 탈락했습니다.`);
    this.eliminate(state, state.currentKey, false);
  }

  // ===== 단어 제출 =====

  @SubscribeMessage('word:submit')
  async onSubmit(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { word?: string },
  ): Promise<void> {
    const state = this.stateOf(client);
    if (!state || state.phase !== 'PLAYING') return;
    const key = this.keyOf(client);
    if (key !== state.currentKey)
      return this.err(client, 'NOT_YOUR_TURN', '당신의 차례가 아닙니다.');

    const word = String(body?.word ?? '').trim();
    if (!isValidHangulWord(word))
      return this.reject(client, '2글자 이상의 한글 단어를 입력하세요.');
    if (state.requiredStarts && !state.requiredStarts.includes(word[0]!))
      return this.reject(
        client,
        `'${state.requiredStarts.join(' / ')}'(으)로 시작하는 단어를 입력하세요.`,
      );
    if (state.usedWords.has(word))
      return this.reject(client, '이미 사용된 단어입니다.');

    const found = await this.service.lookup(word);
    if (!found) return this.reject(client, '사전에 없는 단어입니다.');

    const nextStarts = allowedStarts(word[word.length - 1]!);
    const canContinue = await this.service.hasContinuation(nextStarts, [
      ...state.usedWords,
      word,
    ]);

    // 한방단어 (이어갈 단어 없음)
    if (!canContinue && !state.allowKillerWord) {
      return this.reject(client, '한방단어는 사용할 수 없습니다.');
    }

    // 단어 채택
    state.usedWords.add(word);
    state.lastWord = word;
    state.requiredStarts = nextStarts;
    const p = state.players.get(key);
    this.server.to(state.roomId).emit('word:accepted', {
      by: key,
      nickname: p?.nickname,
      word: found.word,
      definition: found.definition,
      nextStarts,
    });

    if (!canContinue) {
      // 한방단어 허용 모드: 더 이어갈 수 없으므로 제출자가 라운드 승리
      this.emitSystemChat(state, `${p?.nickname ?? '플레이어'}님의 한방단어! 라운드 승리.`);
      this.endRound(state, key);
      return;
    }
    this.startTurn(state, this.gameState.nextAlive(state));
  }

  private reject(client: Socket, reason: string): void {
    client.emit('word:rejected', { reason });
  }

  // ===== 탈락 / 라운드 종료 =====

  private eliminate(state: WordChainState, key: string, leftRoom: boolean): void {
    const wasCurrent = state.currentKey === key;
    const next = wasCurrent ? this.gameState.nextAlive(state) : state.currentKey;
    state.alive = state.alive.filter((k) => k !== key);

    if (state.alive.length <= 1) {
      this.endRound(state, state.alive[0] ?? null);
      return;
    }
    if (wasCurrent) {
      this.startTurn(state, state.alive.includes(next ?? '') ? next : state.alive[0]);
    } else {
      this.emitLobby(state);
    }
    void leftRoom;
  }

  private endRound(state: WordChainState, winnerKey: string | null): void {
    this.gameState.clearTimers(state);
    state.currentKey = null;
    state.turnEndsAt = null;

    if (winnerKey) state.wins.set(winnerKey, (state.wins.get(winnerKey) ?? 0) + 1);
    const winnerName = winnerKey ? state.players.get(winnerKey)?.nickname : null;

    // 토너먼트: 단판 생존자 = 최종 우승
    if (state.mode === 'TOURNAMENT') {
      this.endGame(state, winnerKey);
      return;
    }

    // 라운드제: 남은 라운드 있으면 다음 라운드, 아니면 최다 승 우승
    this.server.to(state.roomId).emit('round:end', {
      round: state.round,
      winnerKey,
      winnerName,
    });
    if (state.round >= state.roundCount) {
      this.endGame(state, this.topWinner(state));
      return;
    }
    state.phase = 'LOBBY'; // 잠깐 대기 표시
    this.emitLobby(state);
    state.startTimer = setTimeout(() => {
      const s = this.getState(state.roomId);
      if (s && s.players.size >= MIN_PLAYERS) this.beginRound(s);
      else if (s) this.abort(s, '플레이어가 부족하여 대기 상태로 돌아갑니다.');
    }, ROUND_GAP_MS);
  }

  private topWinner(state: WordChainState): string | null {
    let best: string | null = null;
    let max = -1;
    for (const [k, w] of state.wins) {
      if (state.order.includes(k) && w > max) {
        max = w;
        best = k;
      }
    }
    return best;
  }

  private endGame(state: WordChainState, winnerKey: string | null): void {
    this.gameState.clearTimers(state);
    state.phase = 'END';
    state.currentKey = null;
    state.turnEndsAt = null;
    state.winnerKey = winnerKey;
    void this.service.setRoomStatus(state.roomId, RoomStatus.WAITING);

    const name = winnerKey ? state.players.get(winnerKey)?.nickname : null;
    this.server.to(state.roomId).emit('game:end', {
      winnerKey,
      winnerName: name,
      wins: [...state.wins.entries()].map(([k, w]) => ({ playerId: k, wins: w })),
    });
    this.emitSystemChat(state, name ? `🏆 ${name}님 우승!` : '게임이 종료되었습니다.');
    this.emitLobby(state);
  }

  private abort(state: WordChainState, reason: string): void {
    this.gameState.clearTimers(state);
    this.gameState.resetSession(state);
    state.phase = 'LOBBY';
    void this.service.setRoomStatus(state.roomId, RoomStatus.WAITING);
    this.emitSystemChat(state, reason);
    this.emitLobby(state);
  }
}
