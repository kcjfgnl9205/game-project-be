import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { RoomsService } from '../rooms/rooms.service';
import type { Identity } from '../auth/decorators/identity.decorator';

export type PlayerType = 'user' | 'guest';

export interface BasePlayer {
  key: string; // identityKey
  type: PlayerType;
  id: string; // User.id 또는 게스트 UUID
  nickname: string;
  socketId: string;
}

// 게임별 상태가 공통으로 갖춰야 하는 최소 형태
export interface BaseGameState {
  roomId: string;
  hostKey: string | null;
  phase: string;
  players: Map<string, BasePlayer>;
}

export function identityKey(type: PlayerType, id: string): string {
  return `${type}:${id}`;
}

interface SocketData {
  roomId: string;
  key: string;
  chatTimes?: number[]; // 최근 채팅 시각 (도배 방지용)
}

interface JwtPayload {
  sub: string;
  role: UserRole;
}

const LEAVE_GRACE_MS = 30_000; // 소켓 끊김 후 DB 정리 유예
const DISCONNECT_GRACE_MS = 8_000; // 인메모리 퇴장 유예 (새로고침/일시 끊김 보호)
const MAX_CHAT_LEN = 200;
// 도배 방지: CHAT_WINDOW_MS 안에 CHAT_MAX_IN_WINDOW개를 초과하면 차단
const CHAT_WINDOW_MS = 3_000;
const CHAT_MAX_IN_WINDOW = 10;

/**
 * 모든 게임 게이트웨이의 공통 생명주기.
 * - 신원 확인(JWT/게스트), 방 입장/퇴장
 * - 재접속 유예(인메모리) + DB 정리 유예, 입장/재접속/퇴장 시스템 메시지
 * - 채팅 브로드캐스트, 로비 스냅샷 emit
 *
 * 게임별 차이는 추상 메서드/훅으로 위임한다.
 */
export abstract class BaseGameGateway<TState extends BaseGameState>
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;

  private readonly leaveTimers = new Map<string, NodeJS.Timeout>();
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    protected readonly rooms: RoomsService,
    protected readonly jwt: JwtService,
  ) {}

  // ===== 게임별 구현 =====

  /** 방을 찾아 게임 상태를 가져오거나 생성한다 (hostKey 포함). 없으면 throw. */
  protected abstract loadState(
    roomId: string,
    auth: Record<string, string>,
  ): Promise<TState>;
  protected abstract getState(roomId: string): TState | undefined;
  protected abstract deleteState(roomId: string): void;
  /** 로비/진행 스냅샷 (lobby:state payload) */
  protected abstract snapshot(state: TState): unknown;
  /** (유예 후) 참가자가 실제로 나갔을 때 후처리(중단/턴 넘김 등). 필요 시 emitLobby 호출. */
  protected abstract onPlayerLeft(
    state: TState,
    key: string,
    ctx: { wasHost: boolean },
  ): void;

  /** 입장 직후 이 클라이언트에게 보낼 게임별 데이터(그림 히스토리/역할 등). 기본 no-op. */
  protected onJoined(
    _state: TState,
    _client: Socket,
    _key: string,
    _isReconnect: boolean,
  ): void {}
  /** 참가자 등록 시 게임 구조 반영(turnOrder/통계 등). 기본 no-op. */
  protected onPlayerAdded(_state: TState, _player: BasePlayer): void {}
  /** 채팅 후처리(정답 판정 등). 기본 no-op. */
  protected onChat(_state: TState, _player: BasePlayer, _text: string): void {}

  // ===== 연결 / 해제 =====

  async handleConnection(client: Socket): Promise<void> {
    try {
      const auth = (client.handshake.auth ?? {}) as Record<string, string>;
      const roomId = auth.roomId;
      if (!roomId) throw new Error('roomId가 필요합니다');

      const { type, id } = this.resolveIdentity(auth);
      const state = await this.loadState(roomId, auth);

      const key = identityKey(type, id);
      this.cancelLeave(roomId, key); // 유예 중이던 DB 정리 취소 (재접속)
      this.cancelDisconnect(roomId, key); // 유예 중이던 인메모리 퇴장 취소 (재접속)

      const player: BasePlayer = {
        key,
        type,
        id,
        nickname: (auth.nickname ?? '').trim() || '플레이어',
        socketId: client.id,
      };
      const isReconnect = state.players.has(key);
      state.players.set(key, player);
      this.onPlayerAdded(state, player);

      (client.data as SocketData) = { roomId, key };
      await client.join(roomId);

      this.emitSystemChat(
        state,
        isReconnect
          ? `${player.nickname}님이 들어왔습니다.`
          : `${player.nickname}님이 입장했습니다.`,
      );
      this.onJoined(state, client, key, isReconnect);
      this.emitLobby(state);
    } catch (e) {
      client.emit('error', {
        code: 'CONNECT_FAILED',
        message: e instanceof Error ? e.message : '연결 실패',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as SocketData | undefined;
    if (!data?.roomId) return;
    const state = this.getState(data.roomId);
    if (!state) return;
    const player = state.players.get(data.key);
    if (!player || player.socketId !== client.id) return; // 재연결로 교체된 stale 소켓

    // 연결 끊김 즉시 안내. 실제 퇴장 처리는 유예 후 finalizeDisconnect에서.
    this.emitSystemChat(state, `${player.nickname}님이 나갔습니다.`);
    this.scheduleDisconnect(data.roomId, data.key);
  }

  private scheduleDisconnect(roomId: string, key: string): void {
    const id = `${roomId}:${key}`;
    if (this.disconnectTimers.has(id)) return;
    const timer = setTimeout(
      () => this.finalizeDisconnect(roomId, key),
      DISCONNECT_GRACE_MS,
    );
    this.disconnectTimers.set(id, timer);
  }

  private cancelDisconnect(roomId: string, key: string): void {
    const id = `${roomId}:${key}`;
    const timer = this.disconnectTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(id);
    }
  }

  // 유예가 끝나도 재접속하지 않은 참가자를 실제로 제거하고 게임별 후처리를 한다.
  private finalizeDisconnect(roomId: string, key: string): void {
    this.disconnectTimers.delete(`${roomId}:${key}`);
    const state = this.getState(roomId);
    if (!state) return;
    const player = state.players.get(key);
    if (!player) return;

    const wasHost = state.hostKey === key;
    state.players.delete(key);
    this.scheduleLeave(roomId, player); // DB 정리도 유예 후

    if (state.players.size === 0) {
      this.deleteState(roomId);
      return;
    }
    if (wasHost) state.hostKey = [...state.players.keys()][0] ?? null;
    this.onPlayerLeft(state, key, { wasHost });
  }

  // ===== 채팅 (공통) =====

  @SubscribeMessage('chat:send')
  onChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { text?: string },
  ): void {
    const state = this.stateOf(client);
    if (!state) return;
    const key = this.keyOf(client);
    const player = state.players.get(key);
    if (!player) return;

    const text = String(body?.text ?? '').slice(0, MAX_CHAT_LEN);
    if (!text.trim()) return;

    // 도배 방지: 최근 윈도우 내 메시지 수 제한
    const data = client.data as SocketData;
    const now = Date.now();
    const times = (data.chatTimes ??= []);
    while (times.length && now - times[0] > CHAT_WINDOW_MS) times.shift();
    if (times.length >= CHAT_MAX_IN_WINDOW) {
      client.emit('chat:system', {
        text: '메시지를 너무 빠르게 보내고 있어요. 잠시 후 다시 시도해주세요.',
        ts: now,
      });
      return;
    }
    times.push(now);

    this.server.to(state.roomId).emit('chat:message', {
      senderId: key,
      nickname: player.nickname,
      text,
      ts: now,
    });
    this.onChat(state, player, text);
  }

  // ===== 공통 헬퍼 (subclass에서 사용) =====

  protected emitLobby(state: TState): void {
    this.server.to(state.roomId).emit('lobby:state', this.snapshot(state));
  }

  protected emitSystemChat(state: TState, text: string): void {
    this.server.to(state.roomId).emit('chat:system', { text, ts: Date.now() });
  }

  protected err(client: Socket, code: string, message: string): void {
    client.emit('error', { code, message });
  }

  protected stateOf(client: Socket): TState | undefined {
    const data = client.data as SocketData | undefined;
    return data?.roomId ? this.getState(data.roomId) : undefined;
  }

  protected keyOf(client: Socket): string {
    return (client.data as SocketData).key;
  }

  // ===== 내부 =====

  private resolveIdentity(auth: Record<string, string>): {
    type: PlayerType;
    id: string;
  } {
    if (auth.token) {
      const payload = this.jwt.verify<JwtPayload>(auth.token, {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      });
      return { type: 'user', id: payload.sub };
    }
    if (auth.guestId) return { type: 'guest', id: auth.guestId };
    throw new Error('인증 정보(token 또는 guestId)가 필요합니다');
  }

  private toIdentity(player: BasePlayer): Identity {
    return player.type === 'user'
      ? { type: 'user', id: player.id, role: UserRole.USER }
      : { type: 'guest', id: player.id };
  }

  private scheduleLeave(roomId: string, player: BasePlayer): void {
    const id = `${roomId}:${player.key}`;
    const existing = this.leaveTimers.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.leaveTimers.delete(id);
      void this.rooms
        .leave(roomId, this.toIdentity(player))
        .catch(() => undefined);
    }, LEAVE_GRACE_MS);
    this.leaveTimers.set(id, timer);
  }

  private cancelLeave(roomId: string, key: string): void {
    const id = `${roomId}:${key}`;
    const timer = this.leaveTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.leaveTimers.delete(id);
    }
  }
}
