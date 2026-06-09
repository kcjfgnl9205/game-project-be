import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateWordDto } from './dto/create-word.dto';
import { UpdateWordDto } from './dto/update-word.dto';
import { BulkCreateWordsDto } from './dto/bulk-create-words.dto';
import {
  BulkCreateResultDto,
  WordListResponseDto,
  WordResponseDto,
} from './dto/word-response.dto';

@Injectable()
export class SketchPicWordsService {
  constructor(private prisma: PrismaService) {}

  async list({
    page,
    limit,
  }: PaginationQueryDto): Promise<WordListResponseDto> {
    const skip = (page - 1) * limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sketchPicWord.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sketchPicWord.count(),
    ]);
    return { total, items };
  }

  async create(dto: CreateWordDto): Promise<WordResponseDto> {
    try {
      return await this.prisma.sketchPicWord.create({
        data: { word: dto.word.trim() },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('이미 존재하는 단어입니다');
      }
      throw e;
    }
  }

  async bulkCreate(dto: BulkCreateWordsDto): Promise<BulkCreateResultDto> {
    const unique = Array.from(
      new Set(dto.words.map((w) => w.trim()).filter(Boolean)),
    );

    const result = await this.prisma.sketchPicWord.createMany({
      data: unique.map((word) => ({ word })),
      skipDuplicates: true,
    });

    return {
      inserted: result.count,
      skipped: unique.length - result.count,
    };
  }

  async update(id: string, dto: UpdateWordDto): Promise<WordResponseDto> {
    await this.ensureExists(id);
    try {
      return await this.prisma.sketchPicWord.update({
        where: { id },
        data: { word: dto.word.trim() },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('이미 존재하는 단어입니다');
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.prisma.sketchPicWord.delete({ where: { id } });
  }

  private async ensureExists(id: string): Promise<void> {
    const word = await this.prisma.sketchPicWord.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!word) throw new NotFoundException('단어를 찾을 수 없습니다');
  }
}
