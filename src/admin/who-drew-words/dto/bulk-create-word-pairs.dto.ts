import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

export class WordPairItemDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 30,
    description: '일반인 단어',
    example: '사자',
  })
  @IsString()
  @Length(1, 30)
  civilianWord!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 30,
    description: '마피아 단어',
    example: '호랑이',
  })
  @IsString()
  @Length(1, 30)
  mafiaWord!: string;
}

export class BulkCreateWordPairsDto {
  @ApiProperty({
    type: [WordPairItemDto],
    description: '단어 쌍 목록 (최대 500개)',
    example: [
      { civilianWord: '사자', mafiaWord: '호랑이' },
      { civilianWord: '버스', mafiaWord: '트럭' },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => WordPairItemDto)
  pairs!: WordPairItemDto[];
}
