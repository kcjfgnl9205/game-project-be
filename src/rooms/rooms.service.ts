import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { GameType, Prisma, RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Identity } from '../auth/decorators/identity.decorator';
import { RoomListQueryDto } from './dto/room-list-query.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import {
  RoomDetailResponseDto,
  RoomListResponseDto,
  RoomResponseDto,
} from './dto/room-response.dto';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async list({
    page,
    limit,
    q,
  }: RoomListQueryDto): Promise<RoomListResponseDto> {
    const skip = (page - 1) * limit;
    // 게임 중(IN_GAME) 방도 목록에 노출한다. (정원 여유 시 중간 입장 허용)
    // q가 있으면 방 이름 부분 일치로 검색한다.
    const keyword = q?.trim();
    const where: Prisma.RoomWhereInput = {
      gameType: GameType.SKETCH_PIC,
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [rooms, total] = await this.prisma.$transaction([
      this.prisma.room.findMany({
        where,
        skip,
        take: limit,
        // 입장 가능한 대기 방을 위로, 그 안에서 최신순.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          sketchPicConfig: true,
          // 나간 사람(leftAt != null)은 제외하고 현재 인원만 센다.
          _count: { select: { participants: { where: { leftAt: null } } } },
        },
      }),
      this.prisma.room.count({ where }),
    ]);

    return {
      total,
      items: rooms.map((r) => this.toResponse(r, r._count.participants)),
    };
  }

  async findOne(id: string): Promise<RoomDetailResponseDto> {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        sketchPicConfig: true,
        participants: {
          where: { leftAt: null },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!room) throw new NotFoundException('방을 찾을 수 없습니다');

    return {
      ...this.toResponse(room, room.participants.length),
      participants: room.participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        guestId: p.guestId,
        nickname: p.nickname,
        isHost: p.isHost,
        joinedAt: p.joinedAt,
      })),
    };
  }

  async create(
    identity: Identity,
    dto: CreateRoomDto,
  ): Promise<RoomDetailResponseDto> {
    const nickname = await this.resolveNickname(identity, dto.nickname);

    if (dto.isPrivate && !dto.password) {
      throw new BadRequestException('비공개 방은 비밀번호가 필요합니다');
    }

    const room = await this.prisma.room.create({
      data: {
        gameType: GameType.SKETCH_PIC,
        name: dto.name,
        maxPlayers: dto.maxPlayers ?? 4,
        isPrivate: dto.isPrivate ?? false,
        password: dto.isPrivate ? dto.password : null,
        hostUserId: identity.type === 'user' ? identity.id : null,
        hostGuestId: identity.type === 'guest' ? identity.id : null,
        sketchPicConfig: {
          create: {
            drawTimeSec: dto.drawTimeSec ?? 60,
          },
        },
        participants: {
          create: {
            userId: identity.type === 'user' ? identity.id : null,
            guestId: identity.type === 'guest' ? identity.id : null,
            nickname,
            isHost: true,
          },
        },
      },
    });

    return this.findOne(room.id);
  }

  async update(
    id: string,
    identity: Identity,
    dto: UpdateRoomDto,
  ): Promise<RoomDetailResponseDto> {
    await this.assertHost(id, identity);

    if (dto.isPrivate && dto.password === '') {
      throw new BadRequestException('비공개 방은 비밀번호가 필요합니다');
    }

    const configUpdate =
      dto.drawTimeSec !== undefined
        ? { update: { drawTimeSec: dto.drawTimeSec } }
        : undefined;

    await this.prisma.room.update({
      where: { id },
      data: {
        name: dto.name,
        maxPlayers: dto.maxPlayers,
        isPrivate: dto.isPrivate,
        password:
          dto.isPrivate === false
            ? null
            : (dto.password ?? undefined),
        sketchPicConfig: configUpdate,
      },
    });

    return this.findOne(id);
  }

  async remove(id: string, identity: Identity): Promise<void> {
    await this.assertHost(id, identity);
    await this.prisma.room.delete({ where: { id } });
  }

  async join(
    id: string,
    identity: Identity,
    dto: JoinRoomDto,
  ): Promise<RoomDetailResponseDto> {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { _count: { select: { participants: { where: { leftAt: null } } } } },
    });
    if (!room) throw new NotFoundException('방을 찾을 수 없습니다');

    // 같은 사람의 기존 참가 기록(나간 기록 포함) 조회
    const existing = await this.findAnyParticipant(id, identity);

    // 이미 활성 참가 중이면 멱등 처리 (재호출/중복 입장 허용)
    if (existing && existing.leftAt === null) {
      return this.findOne(id);
    }

    // 게임 중(IN_GAME)이어도 정원만 남으면 입장 허용 (다음 턴부터 참여).
    if (room._count.participants >= room.maxPlayers) {
      throw new BadRequestException('정원이 가득 찼습니다');
    }

    if (room.isPrivate && room.password !== dto.password) {
      throw new UnauthorizedException('비밀번호가 올바르지 않습니다');
    }

    const nickname = await this.resolveNickname(identity, dto.nickname);

    try {
      if (existing) {
        // 나갔던 참가자 재입장 → 기존 행 되살림 (unique 제약 회피)
        await this.prisma.roomParticipant.update({
          where: { id: existing.id },
          data: { leftAt: null, nickname },
        });
      } else {
        await this.prisma.roomParticipant.create({
          data: {
            roomId: id,
            userId: identity.type === 'user' ? identity.id : null,
            guestId: identity.type === 'guest' ? identity.id : null,
            nickname,
            isHost: false,
          },
        });
      }
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        // 동시 입장 경쟁 등 → 이미 참가 처리된 것으로 간주
        return this.findOne(id);
      }
      throw e;
    }

    return this.findOne(id);
  }

  async leave(id: string, identity: Identity): Promise<void> {
    const participant = await this.findParticipant(id, identity);
    if (!participant) {
      throw new NotFoundException('참가 중인 방이 아닙니다');
    }

    // 본인 퇴장 처리
    await this.prisma.roomParticipant.update({
      where: { id: participant.id },
      data: { leftAt: new Date(), isHost: false },
    });

    if (!participant.isHost) return;

    // 호스트가 나가면 다음 참가자(가장 먼저 입장한 사람)에게 위임, 없으면 방 삭제
    const next = await this.prisma.roomParticipant.findFirst({
      where: { roomId: id, leftAt: null },
      orderBy: { joinedAt: 'asc' },
    });

    if (!next) {
      await this.prisma.room.delete({ where: { id } });
      return;
    }

    await this.prisma.$transaction([
      this.prisma.roomParticipant.update({
        where: { id: next.id },
        data: { isHost: true },
      }),
      this.prisma.room.update({
        where: { id },
        data: { hostUserId: next.userId, hostGuestId: next.guestId },
      }),
    ]);
  }

  // --- helpers ---

  private async assertHost(roomId: string, identity: Identity) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('방을 찾을 수 없습니다');

    const isHost =
      (identity.type === 'user' && room.hostUserId === identity.id) ||
      (identity.type === 'guest' && room.hostGuestId === identity.id);

    if (!isHost) throw new ForbiddenException('호스트만 가능합니다');
  }

  private async findParticipant(roomId: string, identity: Identity) {
    return this.prisma.roomParticipant.findFirst({
      where: {
        roomId,
        leftAt: null,
        ...(identity.type === 'user'
          ? { userId: identity.id }
          : { guestId: identity.id }),
      },
    });
  }

  // leftAt 무관하게 같은 사람의 참가 기록을 찾음 (재입장 판단용)
  private async findAnyParticipant(roomId: string, identity: Identity) {
    return this.prisma.roomParticipant.findFirst({
      where: {
        roomId,
        ...(identity.type === 'user'
          ? { userId: identity.id }
          : { guestId: identity.id }),
      },
    });
  }

  private async resolveNickname(
    identity: Identity,
    fallback: string | undefined,
  ): Promise<string> {
    if (identity.type === 'user') {
      const user = await this.prisma.user.findUnique({
        where: { id: identity.id },
        select: { nickname: true },
      });
      if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다');
      return user.nickname;
    }
    if (!fallback?.trim()) {
      throw new BadRequestException('게스트는 nickname이 필요합니다');
    }
    return fallback.trim();
  }

  private toResponse(
    room: {
      id: string;
      name: string;
      status: RoomStatus;
      maxPlayers: number;
      isPrivate: boolean;
      sketchPicConfig: { drawTimeSec: number } | null;
      createdAt: Date;
    },
    currentPlayers: number,
  ): RoomResponseDto {
    return {
      id: room.id,
      name: room.name,
      status: room.status,
      maxPlayers: room.maxPlayers,
      isPrivate: room.isPrivate,
      drawTimeSec: room.sketchPicConfig?.drawTimeSec ?? 60,
      currentPlayers,
      createdAt: room.createdAt,
    };
  }
}
