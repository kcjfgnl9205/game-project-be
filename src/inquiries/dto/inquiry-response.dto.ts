import { ApiProperty } from '@nestjs/swagger';
import { InquiryStatus } from '@prisma/client';

// 카테고리 (관리자 응답 — 전체 필드)
export class InquiryCategoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: '카테고리명' })
  name!: string;

  @ApiProperty({ description: '노출 순서' })
  sortOrder!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

// 카테고리 (사용자 모달용 — 최소 필드)
export class PublicInquiryCategoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: '카테고리명' })
  name!: string;
}

// 카테고리 요약 (문의 응답에 포함)
export class InquiryCategorySummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: '카테고리명' })
  name!: string;
}

export class InquiryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: '카테고리 ID' })
  categoryId!: string;

  @ApiProperty({ type: InquiryCategorySummaryDto })
  category!: InquiryCategorySummaryDto;

  @ApiProperty({ description: '회신받을 이메일' })
  email!: string;

  @ApiProperty({ description: '제목' })
  title!: string;

  @ApiProperty({ description: '내용' })
  content!: string;

  @ApiProperty({ enum: InquiryStatus, description: '처리 상태' })
  status!: InquiryStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class InquiryListResponseDto {
  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ type: [InquiryResponseDto] })
  items!: InquiryResponseDto[];
}
