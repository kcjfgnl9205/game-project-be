import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseMeta } from '../../common/dto/paginated-response.dto';

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

export class NoticeListResponseDto extends PaginatedResponseMeta {
  @ApiProperty({ type: [NoticeResponseDto] })
  items!: NoticeResponseDto[];
}
