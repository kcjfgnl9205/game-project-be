import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';
import {
  NoticeListResponseDto,
  NoticeResponseDto,
} from './dto/notice-response.dto';

const NOTICE_INCLUDE = {
  author: { select: { id: true, nickname: true } },
} as const;

@Injectable()
export class NoticesService {
  constructor(private prisma: PrismaService) {}

  async list({
    page,
    limit,
  }: PaginationQueryDto): Promise<NoticeListResponseDto> {
    const skip = (page - 1) * limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notice.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: NOTICE_INCLUDE,
      }),
      this.prisma.notice.count({ where: { deletedAt: null } }),
    ]);
    return { items, total, page, limit };
  }

  async findOne(id: string): Promise<NoticeResponseDto> {
    const notice = await this.prisma.notice.findFirst({
      where: { id, deletedAt: null },
      include: NOTICE_INCLUDE,
    });
    if (!notice) throw new NotFoundException('공지사항을 찾을 수 없습니다');
    return notice;
  }

  create(authorId: string, dto: CreateNoticeDto): Promise<NoticeResponseDto> {
    return this.prisma.notice.create({
      data: { ...dto, authorId },
      include: NOTICE_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateNoticeDto): Promise<NoticeResponseDto> {
    await this.findOne(id);
    return this.prisma.notice.update({
      where: { id },
      data: dto,
      include: NOTICE_INCLUDE,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.notice.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
