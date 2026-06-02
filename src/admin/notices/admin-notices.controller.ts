import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { NoticesService } from '../../notices/notices.service';
import { CreateNoticeDto } from '../../notices/dto/create-notice.dto';
import { UpdateNoticeDto } from '../../notices/dto/update-notice.dto';
import { NoticeResponseDto } from '../../notices/dto/notice-response.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';

@ApiBearerAuth()
@ApiTags('admin/notices')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/notices')
export class AdminNoticesController {
  constructor(private noticesService: NoticesService) {}

  @Post()
  @ApiOkResponse({ type: NoticeResponseDto })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateNoticeDto,
  ): Promise<NoticeResponseDto> {
    return this.noticesService.create(user.userId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: NoticeResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNoticeDto,
  ): Promise<NoticeResponseDto> {
    return this.noticesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.noticesService.remove(id);
  }
}
