import { ApiProperty } from '@nestjs/swagger';
import { InquiryStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateInquiryDto {
  @ApiProperty({ enum: InquiryStatus, description: '처리 상태' })
  @IsEnum(InquiryStatus)
  status!: InquiryStatus;
}
