import { Injectable } from '@nestjs/common';
import { Prisma, RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface WordPair {
  civilianWord: string;
  mafiaWord: string;
}

@Injectable()
export class WhoDrewService {
  constructor(private prisma: PrismaService) {}

  // 방 + 그림 마피아 설정 조회 (소켓 입장 시 호스트/설정 파악용)
  async getRoomContext(roomId: string) {
    return this.prisma.room.findUnique({
      where: { id: roomId },
      include: { whoDrewConfig: true },
    });
  }

  // 단어쌍 랜덤 1개 (일반인/마피아). 없으면 null.
  async pickWordPair(): Promise<WordPair | null> {
    const rows = await this.prisma.$queryRaw<WordPair[]>(
      Prisma.sql`SELECT civilianWord, mafiaWord FROM WhoDrewWordPair ORDER BY RAND() LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  async setRoomStatus(roomId: string, status: RoomStatus): Promise<void> {
    await this.prisma.room
      .update({ where: { id: roomId }, data: { status } })
      .catch(() => undefined); // 방이 이미 삭제됐을 수 있음
  }
}
