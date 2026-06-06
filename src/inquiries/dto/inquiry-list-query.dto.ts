import { ApiPropertyOptional } from '@nestjs/swagger';
import { InquiryStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class InquiryListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: InquiryStatus, description: '처리 상태 필터' })
  @IsOptional()
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;

  @ApiPropertyOptional({ description: '카테고리 ID 필터' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
