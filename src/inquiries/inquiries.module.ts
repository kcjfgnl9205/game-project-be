import { Module } from '@nestjs/common';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';
import { InquiryCategoriesService } from './inquiry-categories.service';

@Module({
  controllers: [InquiriesController],
  providers: [InquiriesService, InquiryCategoriesService],
  exports: [InquiriesService, InquiryCategoriesService],
})
export class InquiriesModule {}
