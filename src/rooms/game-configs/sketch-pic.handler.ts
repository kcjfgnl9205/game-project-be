import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { GameType } from '@prisma/client';
import type { GameConfigHandler } from './game-config.handler';

export class SketchPicConfigDto {
  @ApiPropertyOptional({
    default: 60,
    minimum: 10,
    maximum: 180,
    description: '턴별 그리기 시간(초)',
  })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(180)
  drawTimeSec?: number;
}

export const sketchPicHandler: GameConfigHandler<SketchPicConfigDto> = {
  gameType: GameType.SKETCH_PIC,
  configDto: SketchPicConfigDto,
  include: { sketchPicConfig: true },
  buildCreate: (c) => ({
    sketchPicConfig: { create: { drawTimeSec: c.drawTimeSec ?? 60 } },
  }),
  buildUpdate: (c) =>
    c.drawTimeSec === undefined
      ? {}
      : { sketchPicConfig: { update: { drawTimeSec: c.drawTimeSec } } },
  toResponseConfig: (room) => ({
    drawTimeSec: room.sketchPicConfig?.drawTimeSec ?? 60,
  }),
};
