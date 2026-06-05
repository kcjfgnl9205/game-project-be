import { Injectable } from '@nestjs/common';

// 게임 진행 단계 (인메모리)
// LOBBY: 대기 / DRAWING: 턴 돌며 공유 캔버스에 1획씩 / VOTE: 마피아 지목 / RESULT: 결과 공개
export type Phase = 'LOBBY' | 'DRAWING' | 'VOTE' | 'RESULT';

export type PlayerType = 'user' | 'guest';

export interface Player {
  key: string; // identityKey
  type: PlayerType;
  id: string;
  nickname: string;
  socketId: string;
}

// 공유 캔버스의 한 획. seg는 FE가 보낸 페이로드(서버는 opaque하게 저장·중계).
export interface Stroke {
  by: string;
  seg: unknown;
}

export interface WhoDrewConfig {
  rounds: number;
  turnTimeSec: number;
}

// 한 방의 진행 중 게임 상태 (서버 재시작 시 소실되는 ephemeral 데이터)
export interface WhoDrewState {
  roomId: string;
  phase: Phase;
  hostKey: string | null;

  rounds: number; // 각 플레이어가 그리는 횟수(라운드)
  turnTimeSec: number;

  players: Map<string, Player>;
  countedMembers: Set<string>;

  // ===== 게임 세션 (시작 시 확정) =====
  turnOrder: string[]; // 시작 시점 참가자(플레이어) 순서. 라운드 내내 고정.
  mafiaKey: string | null;
  civilianWord: string | null;
  mafiaWord: string | null;
  currentRound: number; // 1..rounds
  turnIndex: number; // turnOrder 내 현재 차례
  strokes: Stroke[]; // 공유 캔버스 히스토리
  votes: Map<string, string>; // voterKey -> 지목 targetKey

  turnTimer: NodeJS.Timeout | null;
  voteTimer: NodeJS.Timeout | null;
  startTimer: NodeJS.Timeout | null;
  startAt: number | null;
  turnEndsAt: number | null;
}

export function identityKey(type: PlayerType, id: string): string {
  return `${type}:${id}`;
}

/**
 * 진행 중 게임 상태를 메모리에 보관한다. (단일 인스턴스 전제)
 * 소켓/DB IO는 하지 않는다 — 순수 상태 보관 + 전이 헬퍼만.
 */
@Injectable()
export class WhoDrewStateService {
  private readonly games = new Map<string, WhoDrewState>();

  get(roomId: string): WhoDrewState | undefined {
    return this.games.get(roomId);
  }

  getOrCreate(
    roomId: string,
    config: WhoDrewConfig,
    hostKey: string | null,
  ): WhoDrewState {
    let game = this.games.get(roomId);
    if (!game) {
      game = {
        roomId,
        phase: 'LOBBY',
        hostKey,
        rounds: config.rounds,
        turnTimeSec: config.turnTimeSec,
        players: new Map(),
        countedMembers: new Set(),
        turnOrder: [],
        mafiaKey: null,
        civilianWord: null,
        mafiaWord: null,
        currentRound: 0,
        turnIndex: 0,
        strokes: [],
        votes: new Map(),
        turnTimer: null,
        voteTimer: null,
        startTimer: null,
        startAt: null,
        turnEndsAt: null,
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

  clearTimers(game: WhoDrewState): void {
    if (game.turnTimer) clearTimeout(game.turnTimer);
    if (game.voteTimer) clearTimeout(game.voteTimer);
    if (game.startTimer) clearTimeout(game.startTimer);
    game.turnTimer = null;
    game.voteTimer = null;
    game.startTimer = null;
    game.startAt = null;
  }

  // 현재 차례 플레이어 key (turnOrder[turnIndex])
  currentTurnKey(game: WhoDrewState): string | null {
    return game.turnOrder[game.turnIndex] ?? null;
  }

  // 게임 세션 상태 초기화 (시작/중단 시)
  resetSession(game: WhoDrewState): void {
    game.mafiaKey = null;
    game.civilianWord = null;
    game.mafiaWord = null;
    game.currentRound = 0;
    game.turnIndex = 0;
    game.strokes = [];
    game.votes = new Map();
    game.turnEndsAt = null;
  }

  // 로비/진행 스냅샷 (클라 브로드캐스트용). 역할/단어 등 비밀은 포함하지 않는다.
  lobbySnapshot(game: WhoDrewState) {
    const currentTurnKey = this.currentTurnKey(game);
    return {
      status: game.phase,
      hostKey: game.hostKey,
      rounds: game.rounds,
      currentRound: game.currentRound,
      currentTurnKey,
      turnEndsAt: game.turnEndsAt,
      startAt: game.startAt,
      players: [...game.players.values()].map((p) => ({
        playerId: p.key,
        type: p.type,
        nickname: p.nickname,
        isHost: p.key === game.hostKey,
        isPlaying: game.turnOrder.includes(p.key),
      })),
    };
  }
}
