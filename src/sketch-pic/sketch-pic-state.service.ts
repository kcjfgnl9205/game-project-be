import { Injectable } from '@nestjs/common';

// 게임 진행 단계 (인메모리)
export type Phase = 'LOBBY' | 'WORD_SELECT' | 'DRAWING' | 'REVEAL';

// identityKey = `user:<id>` | `guest:<id>`
export type PlayerType = 'user' | 'guest';

export interface Player {
  key: string; // identityKey
  type: PlayerType;
  id: string; // User.id 또는 게스트 UUID
  nickname: string;
  socketId: string;
}

export interface WordChoice {
  id: string;
  word: string;
}

// 한 방의 진행 중 게임 상태 (서버 재시작 시 소실되는 ephemeral 데이터)
export interface SketchPicState {
  roomId: string;
  phase: Phase;
  hostKey: string | null;
  drawTimeSec: number;

  players: Map<string, Player>; // key -> Player
  turnOrder: string[]; // 순환 큐 (key 목록)
  currentDrawerKey: string | null;

  wordChoices: WordChoice[]; // 출제자에게 제시한 후보
  word: string | null; // 선택된 출제어
  turnCount: number; // 몇 문제째 (연속 플레이)
  usedWordIds: Set<string>; // 이번 세션에 이미 쓴 단어
  solved: Set<string>; // 이번 턴에 정답 맞힌 key
  turnStartedAt: number; // epoch ms

  turnScores: Map<string, number>; // 이번 턴 획득 점수
  sessionScores: Map<string, number>; // 세션 누적 점수
  countedMembers: Set<string>; // playCount 이미 반영한 회원 key

  turnTimer: NodeJS.Timeout | null;
  selectTimer: NodeJS.Timeout | null;
  startTimer: NodeJS.Timeout | null;
  startAt: number | null;
}

export function identityKey(type: PlayerType, id: string): string {
  return `${type}:${id}`;
}

/**
 * 진행 중 게임 상태를 메모리에 보관한다. (단일 인스턴스 전제)
 * 소켓/DB IO는 하지 않는다 — 순수 상태 보관 + 전이 헬퍼만.
 */
@Injectable()
export class SketchPicStateService {
  private readonly games = new Map<string, SketchPicState>();

  get(roomId: string): SketchPicState | undefined {
    return this.games.get(roomId);
  }

  getOrCreate(
    roomId: string,
    drawTimeSec: number,
    hostKey: string | null,
  ): SketchPicState {
    let game = this.games.get(roomId);
    if (!game) {
      game = {
        roomId,
        phase: 'LOBBY',
        hostKey,
        drawTimeSec,
        players: new Map(),
        turnOrder: [],
        currentDrawerKey: null,
        wordChoices: [],
        word: null,
        turnCount: 0,
        usedWordIds: new Set(),
        solved: new Set(),
        turnStartedAt: 0,
        turnScores: new Map(),
        sessionScores: new Map(),
        countedMembers: new Set(),
        turnTimer: null,
        selectTimer: null,
        startTimer: null,
        startAt: null,
      };
      this.games.set(roomId, game);
    }
    return game;
  }

  delete(roomId: string): void {
    const game = this.games.get(roomId);
    if (game) {
      this.clearTimers(game);
      this.games.delete(roomId);
    }
  }

  clearTimers(game: SketchPicState): void {
    if (game.turnTimer) clearTimeout(game.turnTimer);
    if (game.selectTimer) clearTimeout(game.selectTimer);
    if (game.startTimer) clearTimeout(game.startTimer);
    game.turnTimer = null;
    game.selectTimer = null;
    game.startTimer = null;
    game.startAt = null;
  }

  // 현재 출제자 다음 순서의 key (순환)
  nextDrawerKey(game: SketchPicState): string | null {
    const order = game.turnOrder;
    if (order.length === 0) return null;
    if (!game.currentDrawerKey) return order[0];
    const idx = order.indexOf(game.currentDrawerKey);
    return order[(idx + 1) % order.length];
  }

  addScore(game: SketchPicState, key: string, amount: number): void {
    game.turnScores.set(key, (game.turnScores.get(key) ?? 0) + amount);
    game.sessionScores.set(key, (game.sessionScores.get(key) ?? 0) + amount);
  }

  // 로비/점수판 스냅샷 (클라 브로드캐스트용)
  lobbySnapshot(game: SketchPicState) {
    return {
      status: game.phase,
      hostKey: game.hostKey,
      turnCount: game.turnCount,
      currentDrawerKey: game.currentDrawerKey,
      endsAt:
        game.phase === 'DRAWING'
          ? game.turnStartedAt + game.drawTimeSec * 1000
          : game.phase === 'LOBBY'
            ? game.startAt
            : null,
      players: [...game.players.values()].map((p) => ({
        playerId: p.key,
        type: p.type,
        nickname: p.nickname,
        isHost: p.key === game.hostKey,
        score: game.sessionScores.get(p.key) ?? 0,
      })),
    };
  }

  scoreboard(game: SketchPicState) {
    return [...game.players.values()]
      .map((p) => ({
        playerId: p.key,
        nickname: p.nickname,
        score: game.sessionScores.get(p.key) ?? 0,
      }))
      .sort((a, b) => b.score - a.score);
  }
}
