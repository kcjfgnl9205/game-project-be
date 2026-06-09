import { ApiProperty } from '@nestjs/swagger';

export class WordResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  word!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class WordListResponseDto {
  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ type: [WordResponseDto] })
  items!: WordResponseDto[];
}

export class BulkCreateResultDto {
  @ApiProperty({ description: '추가된 단어 수' })
  inserted!: number;

  @ApiProperty({ description: '중복으로 건너뛴 단어 수' })
  skipped!: number;
}
