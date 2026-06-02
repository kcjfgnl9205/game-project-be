import { Injectable } from '@nestjs/common';
import { Prisma, RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { WordChoice } from './game-state.service';

// 게임 종료 후(턴 단위) 통계 증분 항목 (회원만)
export interface TurnStatEntry {
  userId: string;
  correct: number; // 이번 턴 정답 수 (0/1)
  draw: number; // 이번 턴 출제 수 (0/1)
  score: number; // 이번 턴 획득 점수
}

@Injectable()
export class SketchPicService {
  constructor(private prisma: PrismaService) {}

  // 방 + 스케치픽 설정 조회 (소켓 입장 시 호스트/타이머 파악용)
  async getRoomContext(roomId: string) {
    console.log('[SketchPicService] getRoomContext called with:', roomId);
    const result = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { sketchPicConfig: true },
    });
    console.log(
      '[SketchPicService] getRoomContext result:',
      result ? { id: result.id, gameType: result.gameType } : 'null',
    );
    return result;
  }

  // 출제어 후보를 랜덤 추출 (이미 쓴 단어 제외). 전체 목록은 절대 노출하지 않음.
  async pickWordChoices(
    usedWordIds: Set<string>,
    count = 3,
  ): Promise<WordChoice[]> {
    const used = [...usedWordIds];
    const whereSql = used.length
      ? Prisma.sql`WHERE id NOT IN (${Prisma.join(used)})`
      : Prisma.empty;
    return this.prisma.$queryRaw<WordChoice[]>(
      Prisma.sql`SELECT id, word FROM SketchPicWord ${whereSql} ORDER BY RAND() LIMIT ${Prisma.raw(String(count))}`,
    );
  }

  // 회원 최초 입장 시 playCount +1
  async incrementPlayCount(userId: string): Promise<void> {
    await this.prisma.sketchPicStat.upsert({
      where: { userId },
      create: { userId, playCount: 1, lastPlayedAt: new Date() },
      update: { playCount: { increment: 1 }, lastPlayedAt: new Date() },
    });
  }

  // 턴 종료 시 통계 증분 (회원만, 1 트랜잭션)
  async applyTurnStats(entries: TurnStatEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.prisma.$transaction(
      entries.map((e) =>
        this.prisma.sketchPicStat.upsert({
          where: { userId: e.userId },
          create: {
            userId: e.userId,
            totalScore: e.score,
            drawCount: e.draw,
            correctCount: e.correct,
            lastPlayedAt: new Date(),
          },
          update: {
            totalScore: { increment: e.score },
            drawCount: { increment: e.draw },
            correctCount: { increment: e.correct },
            lastPlayedAt: new Date(),
          },
        }),
      ),
    );
  }

  async setRoomStatus(roomId: string, status: RoomStatus): Promise<void> {
    await this.prisma.room
      .update({ where: { id: roomId }, data: { status } })
      .catch(() => undefined); // 방이 이미 삭제됐을 수 있음
  }
}
