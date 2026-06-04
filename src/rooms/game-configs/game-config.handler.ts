import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GameType, Prisma } from '@prisma/client';

// 게임별 1:1 설정 관계가 모두 로드된 Room (응답 매핑용).
export type RoomWithConfigs = {
  sketchPicConfig: { drawTimeSec: number } | null;
  whoDrewConfig: {
    rounds: number;
    turnTimeSec: number;
    allowMidVote: boolean;
  } | null;
};

// Room create/update 중 "게임별 config 관계" 부분만 (코어 공통 필드는 건드리지 않음).
type RoomConfigCreate = Pick<
  Prisma.RoomCreateInput,
  'sketchPicConfig' | 'whoDrewConfig'
>;
type RoomConfigUpdate = Pick<
  Prisma.RoomUpdateInput,
  'sketchPicConfig' | 'whoDrewConfig'
>;

/**
 * 게임별 방 설정 핸들러(전략).
 * 새 게임 추가 = 핸들러 1개 작성 + 레지스트리 등록만. 코어(rooms.service)는 안 바뀐다.
 */
export interface GameConfigHandler<TConfig extends object = object> {
  readonly gameType: GameType;
  readonly configDto: new () => TConfig; // 요청 config 검증용 DTO
  readonly include: Prisma.RoomInclude; // config 관계 로드용 include
  buildCreate(config: TConfig): RoomConfigCreate; // 방 생성 nested create (기본값 적용)
  buildUpdate(config: TConfig): RoomConfigUpdate; // 방 수정 nested update (제공된 값만)
  toResponseConfig(room: RoomWithConfigs): Record<string, unknown>; // 응답 config 매핑
}

/** 요청 raw config를 게임별 ConfigDto로 검증·정규화한다. */
export function parseGameConfig<T extends object>(
  dtoClass: new () => T,
  raw: unknown,
): T {
  const dto = plainToInstance(dtoClass, raw ?? {}, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(dto as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new BadRequestException(messages);
  }
  return dto;
}
