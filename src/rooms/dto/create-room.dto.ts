import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GameType } from '@prisma/client';

export class CreateRoomDto {
  @ApiPropertyOptional({
    enum: GameType,
    description: '게임 종류 (미지정 시 SKETCH_PIC)',
  })
  @IsOptional()
  @IsEnum(GameType)
  gameType?: GameType;

  @ApiProperty({ example: '재밌게 한 판', maxLength: 50 })
  @IsString()
  @Length(1, 50)
  name!: string;

  @ApiPropertyOptional({ default: 4, minimum: 2, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(10)
  maxPlayers?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @ApiPropertyOptional({ description: '비공개 방 비밀번호', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  password?: string;

  @ApiPropertyOptional({
    type: Object,
    description:
      '게임별 설정 (예: SKETCH_PIC {drawTimeSec}, WHO_DREW {rounds,turnTimeSec,allowMidVote})',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '게스트 닉네임 (게스트면 필수)' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  nickname?: string;

  @ApiPropertyOptional({ description: '게스트 ID (게스트면 필수)' })
  @IsOptional()
  @IsString()
  guestId?: string;
}
