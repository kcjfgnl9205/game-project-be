import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from '../../users/users.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  UserListResponseDto,
  UserResponseDto,
} from '../../users/dto/user-response.dto';

@ApiBearerAuth()
@ApiTags('admin/users')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @ApiOkResponse({ type: UserListResponseDto })
  list(@Query() query: PaginationQueryDto): Promise<UserListResponseDto> {
    return this.usersService.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: UserResponseDto })
  findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findById(id);
  }
}
