import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoomStatus } from '@prisma/client';

export class RoomParticipantDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  userId!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  guestId!: string | null;

  @ApiProperty()
  nickname!: string;

  @ApiProperty()
  isHost!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  joinedAt!: Date;
}

export class RoomResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: RoomStatus })
  status!: RoomStatus;

  @ApiProperty()
  maxPlayers!: number;

  @ApiProperty()
  isPrivate!: boolean;

  @ApiProperty()
  rounds!: number;

  @ApiProperty()
  drawTimeSec!: number;

  @ApiProperty()
  currentPlayers!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class RoomDetailResponseDto extends RoomResponseDto {
  @ApiProperty({ type: [RoomParticipantDto] })
  participants!: RoomParticipantDto[];
}

export class RoomListResponseDto {
  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ type: [RoomResponseDto] })
  items!: RoomResponseDto[];
}
