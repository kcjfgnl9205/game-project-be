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
import { WhoDrewWordsService } from './who-drew-words.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateWordPairDto } from './dto/create-word-pair.dto';
import { UpdateWordPairDto } from './dto/update-word-pair.dto';
import { BulkCreateWordPairsDto } from './dto/bulk-create-word-pairs.dto';
import {
  BulkCreateResultDto,
  WordPairListResponseDto,
  WordPairResponseDto,
} from './dto/word-pair-response.dto';

@ApiBearerAuth()
@ApiTags('admin/who-drew/words')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/who-drew/words')
export class WhoDrewWordsController {
  constructor(private words: WhoDrewWordsService) {}

  @Get()
  @ApiOkResponse({ type: WordPairListResponseDto })
  list(@Query() query: PaginationQueryDto): Promise<WordPairListResponseDto> {
    return this.words.list(query);
  }

  @Post()
  @ApiOkResponse({ type: WordPairResponseDto })
  create(@Body() dto: CreateWordPairDto): Promise<WordPairResponseDto> {
    return this.words.create(dto);
  }

  @Post('bulk')
  @ApiOkResponse({ type: BulkCreateResultDto })
  bulkCreate(
    @Body() dto: BulkCreateWordPairsDto,
  ): Promise<BulkCreateResultDto> {
    return this.words.bulkCreate(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: WordPairResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWordPairDto,
  ): Promise<WordPairResponseDto> {
    return this.words.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.words.remove(id);
  }
}
