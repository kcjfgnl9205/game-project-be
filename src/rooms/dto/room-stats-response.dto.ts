import { ApiProperty } from '@nestjs/swagger';
import { GameType } from '@prisma/client';

// 게임별 방 현황(대기/게임중) 카운트. 게임목록 화면의 "게임중 N개" 표시용.
export class RoomStatDto {
  @ApiProperty({ enum: GameType })
  gameType!: GameType;

  @ApiProperty({ description: '대기 중(WAITING) 방 수' })
  waiting!: number;

  @ApiProperty({ description: '게임 중(IN_GAME) 방 수' })
  inGame!: number;
}
