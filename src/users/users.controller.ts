import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { UserResponseDto } from './dto/user-response.dto';
import { PlayerStatResponseDto } from './dto/player-stat-response.dto';

@ApiBearerAuth()
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOkResponse({ type: UserResponseDto })
  me(@CurrentUser() user: CurrentUserPayload): Promise<UserResponseDto> {
    return this.usersService.findById(user.userId);
  }

  @Get('me/stats')
  @ApiOkResponse({ type: PlayerStatResponseDto })
  myStats(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<PlayerStatResponseDto> {
    return this.usersService.getMyStats(user.userId);
  }
}
