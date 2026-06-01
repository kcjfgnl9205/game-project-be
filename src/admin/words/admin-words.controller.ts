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
import { AdminWordsService } from './admin-words.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateWordDto } from './dto/create-word.dto';
import { UpdateWordDto } from './dto/update-word.dto';
import { BulkCreateWordsDto } from './dto/bulk-create-words.dto';
import {
  BulkCreateResultDto,
  WordListResponseDto,
  WordResponseDto,
} from './dto/word-response.dto';

@ApiBearerAuth()
@ApiTags('admin/words')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/words')
export class AdminWordsController {
  constructor(private words: AdminWordsService) {}

  @Get()
  @ApiOkResponse({ type: WordListResponseDto })
  list(@Query() query: PaginationQueryDto): Promise<WordListResponseDto> {
    return this.words.list(query);
  }

  @Post()
  @ApiOkResponse({ type: WordResponseDto })
  create(@Body() dto: CreateWordDto): Promise<WordResponseDto> {
    return this.words.create(dto);
  }

  @Post('bulk')
  @ApiOkResponse({ type: BulkCreateResultDto })
  bulkCreate(@Body() dto: BulkCreateWordsDto): Promise<BulkCreateResultDto> {
    return this.words.bulkCreate(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: WordResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWordDto,
  ): Promise<WordResponseDto> {
    return this.words.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.words.remove(id);
  }
}
