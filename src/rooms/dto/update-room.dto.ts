import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateRoomDto {
  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @ApiPropertyOptional({ minimum: 2, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(10)
  maxPlayers?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  password?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  rounds?: number;

  @ApiPropertyOptional({ minimum: 10, maximum: 180 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(180)
  drawTimeSec?: number;
}
