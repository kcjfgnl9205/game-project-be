import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { NoticesService } from './notices.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';
import {
  NoticeListResponseDto,
  NoticeResponseDto,
} from './dto/notice-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
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

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  @ApiOkResponse({ type: NoticeResponseDto })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateNoticeDto,
  ): Promise<NoticeResponseDto> {
    return this.noticesService.create(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  @ApiOkResponse({ type: NoticeResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNoticeDto,
  ): Promise<NoticeResponseDto> {
    return this.noticesService.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.noticesService.remove(id);
  }
}
