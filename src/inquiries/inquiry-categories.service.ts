import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInquiryCategoryDto } from './dto/create-inquiry-category.dto';
import { UpdateInquiryCategoryDto } from './dto/update-inquiry-category.dto';
import {
  InquiryCategoryResponseDto,
  PublicInquiryCategoryDto,
} from './dto/inquiry-response.dto';

const ORDER_BY: Prisma.InquiryCategoryOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { name: 'asc' },
];

@Injectable()
export class InquiryCategoriesService {
  constructor(private prisma: PrismaService) {}

  // 사용자 모달용: 최소 필드만
  listPublic(): Promise<PublicInquiryCategoryDto[]> {
    return this.prisma.inquiryCategory.findMany({
      select: { id: true, name: true },
      orderBy: ORDER_BY,
    });
  }

  // 관리자용: 전체 필드
  list(): Promise<InquiryCategoryResponseDto[]> {
    return this.prisma.inquiryCategory.findMany({ orderBy: ORDER_BY });
  }

  async create(
    dto: CreateInquiryCategoryDto,
  ): Promise<InquiryCategoryResponseDto> {
    try {
      return await this.prisma.inquiryCategory.create({
        data: { name: dto.name.trim(), sortOrder: dto.sortOrder ?? 0 },
      });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(
    id: string,
    dto: UpdateInquiryCategoryDto,
  ): Promise<InquiryCategoryResponseDto> {
    await this.ensureExists(id);
    try {
      return await this.prisma.inquiryCategory.update({
        where: { id },
        data: { name: dto.name.trim(), sortOrder: dto.sortOrder ?? 0 },
      });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    try {
      await this.prisma.inquiryCategory.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new ConflictException(
          '해당 카테고리로 등록된 문의가 있어 삭제할 수 없습니다',
        );
      }
      throw e;
    }
  }

  private async ensureExists(id: string): Promise<void> {
    const category = await this.prisma.inquiryCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('카테고리를 찾을 수 없습니다');
  }

  private mapError(e: unknown): unknown {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException('이미 존재하는 카테고리명입니다');
    }
    return e;
  }
}
