import { GameType, Prisma } from '@prisma/client';
import type { GameConfigHandler } from './game-config.handler';
import { sketchPicHandler } from './sketch-pic.handler';
import { whoDrewHandler } from './who-drew.handler';
import { wordChainHandler } from './word-chain.handler';

// Record<GameType, ...>이므로 새 GameType이 생기면 여기서 컴파일 에러 → 누락 방지.
const HANDLERS: Record<GameType, GameConfigHandler> = {
  [GameType.SKETCH_PIC]: sketchPicHandler,
  [GameType.WHO_DREW]: whoDrewHandler,
  [GameType.WORD_CHAIN]: wordChainHandler,
};

export function getGameHandler(gameType: GameType): GameConfigHandler {
  return HANDLERS[gameType];
}

// 모든 게임의 config 관계를 한 번에 로드하는 include (gameType을 모르고 조회할 때).
export function allConfigIncludes(): Prisma.RoomInclude {
  return Object.values(HANDLERS).reduce<Prisma.RoomInclude>(
    (acc, h) => ({ ...acc, ...h.include }),
    {},
  );
}

export type { GameConfigHandler } from './game-config.handler';
export { parseGameConfig } from './game-config.handler';
