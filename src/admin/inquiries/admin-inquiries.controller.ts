import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { InquiriesService } from '../../inquiries/inquiries.service';
import { InquiryListQueryDto } from '../../inquiries/dto/inquiry-list-query.dto';
import { UpdateInquiryDto } from '../../inquiries/dto/update-inquiry.dto';
import {
  InquiryListResponseDto,
  InquiryResponseDto,
} from '../../inquiries/dto/inquiry-response.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';

@ApiBearerAuth()
@ApiTags('admin/inquiries')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/inquiries')
export class AdminInquiriesController {
  constructor(private inquiries: InquiriesService) {}

  @Get()
  @ApiOkResponse({ type: InquiryListResponseDto })
  list(@Query() query: InquiryListQueryDto): Promise<InquiryListResponseDto> {
    return this.inquiries.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: InquiryResponseDto })
  findOne(@Param('id') id: string): Promise<InquiryResponseDto> {
    return this.inquiries.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: InquiryResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInquiryDto,
  ): Promise<InquiryResponseDto> {
    return this.inquiries.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.inquiries.remove(id);
  }
}
