import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateInquiryCategoryDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 50,
    description: '카테고리명',
    example: '버그 제보',
  })
  @IsString()
  @Length(1, 50)
  name!: string;

  @ApiPropertyOptional({ description: '노출 순서 (오름차순)', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
