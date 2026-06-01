import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { Public } from '../auth/decorators/public.decorator';
import { IdentityGuard } from '../auth/guards/identity.guard';
import {
  GetIdentity,
  Identity,
} from '../auth/decorators/identity.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import {
  RoomDetailResponseDto,
  RoomListResponseDto,
} from './dto/room-response.dto';

@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private rooms: RoomsService) {}

  @Public()
  @Get()
  @ApiOkResponse({ type: RoomListResponseDto })
  list(@Query() query: PaginationQueryDto): Promise<RoomListResponseDto> {
    return this.rooms.list(query);
  }

  @Public()
  @Get(':id')
  @ApiOkResponse({ type: RoomDetailResponseDto })
  findOne(@Param('id') id: string): Promise<RoomDetailResponseDto> {
    return this.rooms.findOne(id);
  }

  @Public()
  @UseGuards(IdentityGuard)
  @ApiBearerAuth()
  @Post()
  @ApiOkResponse({ type: RoomDetailResponseDto })
  create(
    @GetIdentity() identity: Identity | null,
    @Body() dto: CreateRoomDto,
  ): Promise<RoomDetailResponseDto> {
    if (!identity) {
      throw new BadRequestException(
        '회원 로그인 또는 게스트 ID(guestId)가 필요합니다',
      );
    }
    return this.rooms.create(identity, dto);
  }

  @Public()
  @UseGuards(IdentityGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOkResponse({ type: RoomDetailResponseDto })
  update(
    @Param('id') id: string,
    @GetIdentity() identity: Identity | null,
    @Body() dto: UpdateRoomDto,
  ): Promise<RoomDetailResponseDto> {
    if (!identity) throw new BadRequestException('인증 정보가 필요합니다');
    return this.rooms.update(id, identity, dto);
  }

  @Public()
  @UseGuards(IdentityGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @Param('id') id: string,
    @GetIdentity() identity: Identity | null,
  ): Promise<void> {
    if (!identity) throw new BadRequestException('인증 정보가 필요합니다');
    return this.rooms.remove(id, identity);
  }

  @Public()
  @UseGuards(IdentityGuard)
  @ApiBearerAuth()
  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RoomDetailResponseDto })
  join(
    @Param('id') id: string,
    @GetIdentity() identity: Identity | null,
    @Body() dto: JoinRoomDto,
  ): Promise<RoomDetailResponseDto> {
    if (!identity) {
      throw new BadRequestException(
        '회원 로그인 또는 게스트 ID(guestId)가 필요합니다',
      );
    }
    return this.rooms.join(id, identity, dto);
  }

  @Public()
  @UseGuards(IdentityGuard)
  @ApiBearerAuth()
  @Post(':id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  leave(
    @Param('id') id: string,
    @GetIdentity() identity: Identity | null,
  ): Promise<void> {
    if (!identity) throw new BadRequestException('인증 정보가 필요합니다');
    return this.rooms.leave(id, identity);
  }
}
