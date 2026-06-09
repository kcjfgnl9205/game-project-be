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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { InquiryCategoriesService } from '../../inquiries/inquiry-categories.service';
import { CreateInquiryCategoryDto } from '../../inquiries/dto/create-inquiry-category.dto';
import { UpdateInquiryCategoryDto } from '../../inquiries/dto/update-inquiry-category.dto';
import { InquiryCategoryResponseDto } from '../../inquiries/dto/inquiry-response.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';

@ApiBearerAuth()
@ApiTags('admin/inquiries')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/inquiries/categories')
export class AdminInquiryCategoriesController {
  constructor(private categories: InquiryCategoriesService) {}

  @Get()
  @ApiOkResponse({ type: [InquiryCategoryResponseDto] })
  list(): Promise<InquiryCategoryResponseDto[]> {
    return this.categories.list();
  }

  @Post()
  @ApiOkResponse({ type: InquiryCategoryResponseDto })
  create(
    @Body() dto: CreateInquiryCategoryDto,
  ): Promise<InquiryCategoryResponseDto> {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: InquiryCategoryResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInquiryCategoryDto,
  ): Promise<InquiryCategoryResponseDto> {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.categories.remove(id);
  }
}
