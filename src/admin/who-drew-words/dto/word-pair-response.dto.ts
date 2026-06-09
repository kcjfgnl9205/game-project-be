import { ApiProperty } from '@nestjs/swagger';

export class WordPairResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: '일반인 단어' })
  civilianWord!: string;

  @ApiProperty({ description: '마피아 단어' })
  mafiaWord!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class WordPairListResponseDto {
  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ type: [WordPairResponseDto] })
  items!: WordPairResponseDto[];
}

export class BulkCreateResultDto {
  @ApiProperty({ description: '추가된 단어쌍 수' })
  inserted!: number;

  @ApiProperty({ description: '중복으로 건너뛴 단어쌍 수' })
  skipped!: number;
}
