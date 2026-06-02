import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { UserListResponseDto, UserResponseDto } from './dto/user-response.dto';
import { PlayerStatResponseDto } from './dto/player-stat-response.dto';

const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  nickname: true,
  provider: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다');
    return user;
  }

  async list({
    page,
    limit,
  }: PaginationQueryDto): Promise<UserListResponseDto> {
    const skip = (page - 1) * limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: USER_PUBLIC_SELECT,
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);
    return { items, total };
  }

  async getMyStats(userId: string): Promise<PlayerStatResponseDto> {
    const stat = await this.prisma.sketchPicStat.findUnique({
      where: { userId },
    });

    if (!stat) {
      return {
        playCount: 0,
        winCount: 0,
        totalScore: 0,
        drawCount: 0,
        correctCount: 0,
        lastPlayedAt: null,
      };
    }

    return {
      playCount: stat.playCount,
      winCount: stat.winCount,
      totalScore: stat.totalScore,
      drawCount: stat.drawCount,
      correctCount: stat.correctCount,
      lastPlayedAt: stat.lastPlayedAt,
    };
  }
}
