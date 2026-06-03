import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class RoomListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '방 이름 검색어' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  q?: string;
}
