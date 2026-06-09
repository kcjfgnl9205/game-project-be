import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { NoticesService } from './notices.service';
import {
  NoticeListResponseDto,
  NoticeResponseDto,
} from './dto/notice-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

@ApiTags('notices')
@Controller('notices')
export class NoticesController {
  constructor(private noticesService: NoticesService) {}

  @Public()
  @Get()
  @ApiOkResponse({ type: NoticeListResponseDto })
  list(@Query() query: PaginationQueryDto): Promise<NoticeListResponseDto> {
    return this.noticesService.list(query);
  }

  @Public()
  @Get(':id')
  @ApiOkResponse({ type: NoticeResponseDto })
  findOne(@Param('id') id: string): Promise<NoticeResponseDto> {
    return this.noticesService.findOne(id);
  }
}
