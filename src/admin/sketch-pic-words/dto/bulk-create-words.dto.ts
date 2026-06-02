import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Length } from 'class-validator';

export class BulkCreateWordsDto {
  @ApiProperty({
    type: [String],
    description: '단어 목록 (최대 500개)',
    example: ['사과', '바나나', '자동차'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Length(1, 30, { each: true })
  words!: string[];
}
