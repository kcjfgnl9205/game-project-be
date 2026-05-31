import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { UserListResponseDto, UserResponseDto } from './dto/user-response.dto';

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

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  @ApiOkResponse({ type: UserListResponseDto })
  list(@Query() query: PaginationQueryDto): Promise<UserListResponseDto> {
    return this.usersService.list(query);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  @ApiOkResponse({ type: UserResponseDto })
  findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findById(id);
  }
}
