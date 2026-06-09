import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { GameType } from '@prisma/client';
import type { GameConfigHandler } from './game-config.handler';

export class WhoDrewConfigDto {
  @ApiPropertyOptional({
    default: 5,
    minimum: 4,
    maximum: 8,
    description: '각 플레이어가 그리는 횟수(라운드)',
  })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(8)
  rounds?: number;

  @ApiPropertyOptional({
    default: 20,
    minimum: 10,
    maximum: 60,
    description: '한 획당 제한 시간(초)',
  })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(60)
  turnTimeSec?: number;
}

export const whoDrewHandler: GameConfigHandler<WhoDrewConfigDto> = {
  gameType: GameType.WHO_DREW,
  configDto: WhoDrewConfigDto,
  include: { whoDrewConfig: true },
  buildCreate: (c) => ({
    whoDrewConfig: {
      create: {
        rounds: c.rounds ?? 5,
        turnTimeSec: c.turnTimeSec ?? 20,
      },
    },
  }),
  buildUpdate: (c) => {
    const data = {
      ...(c.rounds !== undefined ? { rounds: c.rounds } : {}),
      ...(c.turnTimeSec !== undefined ? { turnTimeSec: c.turnTimeSec } : {}),
    };
    return Object.keys(data).length ? { whoDrewConfig: { update: data } } : {};
  },
  toResponseConfig: (room) => ({
    rounds: room.whoDrewConfig?.rounds ?? 5,
    turnTimeSec: room.whoDrewConfig?.turnTimeSec ?? 20,
  }),
};
