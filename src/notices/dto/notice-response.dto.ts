import { ApiProperty } from '@nestjs/swagger';

export class NoticeAuthorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  nickname!: string;
}

export class NoticeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  authorId!: string;

  @ApiProperty({ type: NoticeAuthorDto })
  author!: NoticeAuthorDto;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class NoticeListResponseDto {
  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ type: [NoticeResponseDto] })
  items!: NoticeResponseDto[];
}
