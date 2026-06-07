import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InquiryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { InquiryListQueryDto } from './dto/inquiry-list-query.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import {
  EmailPurgeResultDto,
  InquiryListResponseDto,
  InquiryResponseDto,
} from './dto/inquiry-response.dto';

const RETENTION_YEARS = 1; // 처리 완료 후 이메일 보관 기간

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
        privacyConsent: dto.privacyConsent,
        privacyConsentAt: new Date(), // 동의 시각은 서버 기준
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
    const current = await this.prisma.inquiry.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('문의를 찾을 수 없습니다');

    // 보관기간 기준점: DONE으로 처음 전환될 때 processedAt 기록, DONE 해제 시 초기화.
    const data: Prisma.InquiryUpdateInput = { status: dto.status };
    if (
      dto.status === InquiryStatus.DONE &&
      current.status !== InquiryStatus.DONE
    ) {
      data.processedAt = new Date();
    } else if (dto.status !== InquiryStatus.DONE) {
      data.processedAt = null;
    }

    return this.prisma.inquiry.update({
      where: { id },
      data,
      include: INQUIRY_INCLUDE,
    });
  }

  // 처리 완료 후 보관기간(1년)이 지난 문의의 이메일을 null 처리한다. (관리자 수동 실행)
  async purgeExpiredEmails(): Promise<EmailPurgeResultDto> {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);

    const res = await this.prisma.inquiry.updateMany({
      where: {
        status: InquiryStatus.DONE,
        processedAt: { lte: cutoff },
        email: { not: null },
      },
      data: { email: null },
    });
    return { affected: res.count };
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
