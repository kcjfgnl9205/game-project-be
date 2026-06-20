import { Injectable } from '@nestjs/common';
import { RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WordChainService {
  constructor(private prisma: PrismaService) {}

  // 방 + 끝말잇기 설정 조회 (소켓 입장 시 호스트/설정 파악용)
  async getRoomContext(roomId: string) {
    return this.prisma.room.findUnique({
      where: { id: roomId },
      include: { wordChainConfig: true },
    });
  }

  // 단어 존재 + 뜻 조회. 사전에 없으면 null.
  async lookup(word: string): Promise<{ word: string; definition: string } | null> {
    return this.prisma.wordChainWord.findUnique({
      where: { word },
      select: { word: true, definition: true },
    });
  }

  // 주어진 시작 글자 후보로 이어갈 수 있는(아직 안 쓴) 단어가 존재하는가.
  // false면 한방단어(더 이어갈 수 없음).
  async hasContinuation(starts: string[], used: string[]): Promise<boolean> {
    const count = await this.prisma.wordChainWord.count({
      where: {
        firstChar: { in: starts },
        ...(used.length ? { word: { notIn: used } } : {}),
      },
    });
    return count > 0;
  }

  async setRoomStatus(roomId: string, status: RoomStatus): Promise<void> {
    await this.prisma.room
      .update({ where: { id: roomId }, data: { status } })
      .catch(() => undefined); // 방이 이미 삭제됐을 수 있음
  }
}
