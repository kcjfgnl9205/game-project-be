import { ApiProperty } from '@nestjs/swagger';
import { AuthProvider, UserRole } from '@prisma/client';
import { PaginatedResponseMeta } from '../../common/dto/paginated-response.dto';

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true, type: String })
  email!: string | null;

  @ApiProperty()
  nickname!: string;

  @ApiProperty({ enum: AuthProvider })
  provider!: AuthProvider;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class UserListResponseDto extends PaginatedResponseMeta {
  @ApiProperty({ type: [UserResponseDto] })
  items!: UserResponseDto[];
}
