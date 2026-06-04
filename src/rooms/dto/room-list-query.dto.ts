import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { GameType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class RoomListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '방 이름 검색어' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  q?: string;

  @ApiPropertyOptional({
    enum: GameType,
    description: '게임 종류 필터 (미지정 시 SKETCH_PIC)',
  })
  @IsOptional()
  @IsEnum(GameType)
  gameType?: GameType;
}
