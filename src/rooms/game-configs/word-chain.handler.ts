import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { GameType, WordChainMode } from '@prisma/client';
import type { GameConfigHandler } from './game-config.handler';

export class WordChainConfigDto {
  @ApiPropertyOptional({
    enum: WordChainMode,
    default: WordChainMode.ROUND,
    description: '게임 방식 (ROUND: 라운드제 / TOURNAMENT: 토너먼트)',
  })
  @IsOptional()
  @IsEnum(WordChainMode)
  mode?: WordChainMode;

  @ApiPropertyOptional({
    default: 3,
    minimum: 1,
    maximum: 10,
    description: '라운드제 라운드 수 (토너먼트면 인원에서 파생, 무시)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  roundCount?: number;

  @ApiPropertyOptional({
    default: 15,
    minimum: 5,
    maximum: 60,
    description: '1인당 단어 입력 제한 시간(초)',
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  turnTimeSec?: number;

  @ApiPropertyOptional({
    default: false,
    description: '한방단어 허용 여부 (두음법칙은 항상 적용)',
  })
  @IsOptional()
  @IsBoolean()
  allowKillerWord?: boolean;
}

export const wordChainHandler: GameConfigHandler<WordChainConfigDto> = {
  gameType: GameType.WORD_CHAIN,
  configDto: WordChainConfigDto,
  include: { wordChainConfig: true },
  buildCreate: (c) => ({
    wordChainConfig: {
      create: {
        mode: c.mode ?? WordChainMode.ROUND,
        roundCount: c.roundCount ?? 3,
        turnTimeSec: c.turnTimeSec ?? 15,
        allowKillerWord: c.allowKillerWord ?? false,
      },
    },
  }),
  buildUpdate: (c) => {
    const data = {
      ...(c.mode !== undefined ? { mode: c.mode } : {}),
      ...(c.roundCount !== undefined ? { roundCount: c.roundCount } : {}),
      ...(c.turnTimeSec !== undefined ? { turnTimeSec: c.turnTimeSec } : {}),
      ...(c.allowKillerWord !== undefined ? { allowKillerWord: c.allowKillerWord } : {}),
    };
    return Object.keys(data).length ? { wordChainConfig: { update: data } } : {};
  },
  toResponseConfig: (room) => ({
    mode: room.wordChainConfig?.mode ?? WordChainMode.ROUND,
    roundCount: room.wordChainConfig?.roundCount ?? 3,
    turnTimeSec: room.wordChainConfig?.turnTimeSec ?? 15,
    allowKillerWord: room.wordChainConfig?.allowKillerWord ?? false,
  }),
};
