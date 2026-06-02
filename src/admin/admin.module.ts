import { Module } from '@nestjs/common';
import { NoticesModule } from '../notices/notices.module';
import { UsersModule } from '../users/users.module';
import { SketchPicWordsController } from './sketch-pic-words/sketch-pic-words.controller';
import { SketchPicWordsService } from './sketch-pic-words/sketch-pic-words.service';
import { AdminNoticesController } from './notices/admin-notices.controller';
import { AdminUsersController } from './users/admin-users.controller';

@Module({
  imports: [NoticesModule, UsersModule],
  controllers: [
    SketchPicWordsController,
    AdminNoticesController,
    AdminUsersController,
  ],
  providers: [SketchPicWordsService],
})
export class AdminModule {}
