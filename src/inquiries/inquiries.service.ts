import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { InquiryListQueryDto } from './dto/inquiry-list-query.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import {
  InquiryListResponseDto,
  InquiryResponseDto,
} from './dto/inquiry-response.dto';

const INQUIRY_INCLUDE = {
  category: { select: { id: true, name: true } },
} as const;

@Injectable()
export class InquiriesService {
  constructor(private prisma: PrismaService) {}

  // 사용자 문의 접수
  async create(dto: CreateInquiryDto): Promise<InquiryResponseDto> {
    const category = await this.prisma.inquiryCategory.findUnique({
      where: { id: dto.categoryId },
      select: { id: true },
    });
    if (!category)
      throw new BadRequestException('존재하지 않는 카테고리입니다');

    return this.prisma.inquiry.create({
      data: {
        categoryId: dto.categoryId,
        email: dto.email.trim(),
        title: dto.title.trim(),
        content: dto.content.trim(),
      },
      include: INQUIRY_INCLUDE,
    });
  }

  // 관리자 목록 (상태/카테고리 필터 + 페이지네이션)
  async list({
    page,
    limit,
    status,
    categoryId,
  }: InquiryListQueryDto): Promise<InquiryListResponseDto> {
    const skip = (page - 1) * limit;
    const where: Prisma.InquiryWhereInput = {
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inquiry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: INQUIRY_INCLUDE,
      }),
      this.prisma.inquiry.count({ where }),
    ]);
    return { total, items };
  }

  async findOne(id: string): Promise<InquiryResponseDto> {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      include: INQUIRY_INCLUDE,
    });
    if (!inquiry) throw new NotFoundException('문의를 찾을 수 없습니다');
    return inquiry;
  }

  async update(id: string, dto: UpdateInquiryDto): Promise<InquiryResponseDto> {
    await this.ensureExists(id);
    return this.prisma.inquiry.update({
      where: { id },
      data: { status: dto.status },
      include: INQUIRY_INCLUDE,
    });
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.prisma.inquiry.delete({ where: { id } });
  }

  private async ensureExists(id: string): Promise<void> {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!inquiry) throw new NotFoundException('문의를 찾을 수 없습니다');
  }
}
