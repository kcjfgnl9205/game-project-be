import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResponseMeta {
  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
