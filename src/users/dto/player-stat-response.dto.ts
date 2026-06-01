import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlayerStatResponseDto {
  @ApiProperty()
  playCount!: number;

  @ApiProperty()
  winCount!: number;

  @ApiProperty()
  totalScore!: number;

  @ApiProperty()
  drawCount!: number;

  @ApiProperty()
  correctCount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastPlayedAt!: Date | null;
}
