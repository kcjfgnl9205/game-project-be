import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { InquiriesService } from './inquiries.service';
import { InquiryCategoriesService } from './inquiry-categories.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import {
  InquiryResponseDto,
  PublicInquiryCategoryDto,
} from './dto/inquiry-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('inquiries')
@Controller('inquiries')
export class InquiriesController {
  constructor(
    private inquiries: InquiriesService,
    private categories: InquiryCategoriesService,
  ) {}

  @Public()
  @Get('categories')
  @ApiOkResponse({ type: [PublicInquiryCategoryDto] })
  listCategories(): Promise<PublicInquiryCategoryDto[]> {
    return this.categories.listPublic();
  }

  @Public()
  @Post()
  @ApiOkResponse({ type: InquiryResponseDto })
  create(@Body() dto: CreateInquiryDto): Promise<InquiryResponseDto> {
    return this.inquiries.create(dto);
  }
}
