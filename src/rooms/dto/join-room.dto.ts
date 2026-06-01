import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class JoinRoomDto {
  @ApiPropertyOptional({ description: '비공개 방 비밀번호' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  password?: string;

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
