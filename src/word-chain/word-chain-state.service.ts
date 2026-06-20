import { Injectable } from '@nestjs/common';
import type { BaseGameState, BasePlayer } from '../game-common/base-game.gateway';

// LOBBY: 대기 / PLAYING: 진행(차례 돌며 단어 제출) / END: 결과
export type Phase = 'LOBBY' | 'PLAYING' | 'END';
export type Mode = 'ROUND' | 'TOURNAMENT';

export interface WordChainConfig {
  mode: Mode;
  roundCount: number;
  turnTimeSec: number;
  allowKillerWord: boolean;
}

export interface WordChainState extends BaseGameState {
  roomId: string;
  hostKey: string | null;
  phase: Phase;
  players: Map<string, BasePlayer>;

  // 설정
  mode: Mode;
  roundCount: number;
  turnTimeSec: number;
  allowKillerWord: boolean;

  // 세션(시작 시 확정)
  order: string[]; // 시작 시점 참가자 순서 (라운드제 재시작용)
  alive: string[]; // 현재 라운드 생존자 (순서 유지)
  currentKey: string | null; // 현재 차례
  usedWords: Set<string>;
  lastWord: string | null;
  requiredStarts: string[] | null; // 다음 단어 시작 후보(두음 포함). null=첫 단어
  round: number; // 현재 라운드 (1-base)
  wins: Map<string, number>; // 라운드제 라운드 승수
  winnerKey: string | null; // 최종 우승자 (END 시)

  startAt: number | null;
  turnEndsAt: number | null;
  startTimer: NodeJS.Timeout | null;
  turnTimer: NodeJS.Timeout | null;
}

@Injectable()
export class WordChainStateService {
  private readonly games = new Map<string, WordChainState>();

  get(roomId: string): WordChainState | undefined {
    return this.games.get(roomId);
  }

  getOrCreate(
    roomId: string,
    config: WordChainConfig,
    hostKey: string | null,
  ): WordChainState {
    let game = this.games.get(roomId);
    if (!game) {
      game = {
        roomId,
        hostKey,
        phase: 'LOBBY',
        players: new Map(),
        mode: config.mode,
        roundCount: config.roundCount,
        turnTimeSec: config.turnTimeSec,
        allowKillerWord: config.allowKillerWord,
        order: [],
        alive: [],
        currentKey: null,
        usedWords: new Set(),
        lastWord: null,
        requiredStarts: null,
        round: 0,
        wins: new Map(),
        winnerKey: null,
        startAt: null,
        turnEndsAt: null,
        startTimer: null,
        turnTimer: null,
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

  clearTimers(game: WordChainState): void {
    if (game.startTimer) clearTimeout(game.startTimer);
    if (game.turnTimer) clearTimeout(game.turnTimer);
    game.startTimer = null;
    game.turnTimer = null;
  }

  // 세션 초기화 (게임 시작/중단 시)
  resetSession(game: WordChainState): void {
    this.clearTimers(game);
    game.order = [];
    game.alive = [];
    game.currentKey = null;
    game.usedWords = new Set();
    game.lastWord = null;
    game.requiredStarts = null;
    game.round = 0;
    game.wins = new Map();
    game.winnerKey = null;
    game.startAt = null;
    game.turnEndsAt = null;
  }

  // 현재 차례 다음 생존자 key
  nextAlive(game: WordChainState): string | null {
    if (!game.alive.length) return null;
    if (!game.currentKey) return game.alive[0] ?? null;
    const i = game.alive.indexOf(game.currentKey);
    return game.alive[(i + 1) % game.alive.length] ?? null;
  }

  lobbySnapshot(game: WordChainState) {
    return {
      status: game.phase,
      hostKey: game.hostKey,
      mode: game.mode,
      roundCount: game.roundCount,
      round: game.round,
      turnTimeSec: game.turnTimeSec,
      allowKillerWord: game.allowKillerWord,
      currentTurnKey: game.currentKey,
      requiredStarts: game.requiredStarts,
      lastWord: game.lastWord,
      usedCount: game.usedWords.size,
      turnEndsAt: game.turnEndsAt,
      startAt: game.startAt,
      winnerKey: game.winnerKey,
      players: [...game.players.values()].map((p) => ({
        playerId: p.key,
        type: p.type,
        nickname: p.nickname,
        isHost: p.key === game.hostKey,
        isPlaying: game.order.includes(p.key),
        isAlive: game.alive.includes(p.key),
        wins: game.wins.get(p.key) ?? 0,
      })),
    };
  }
}
