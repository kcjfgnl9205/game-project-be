import { Module } from '@nestjs/common';
import { NoticesModule } from '../notices/notices.module';
import { UsersModule } from '../users/users.module';
import { SketchPicWordsController } from './sketch-pic-words/sketch-pic-words.controller';
import { SketchPicWordsService } from './sketch-pic-words/sketch-pic-words.service';
import { WhoDrewWordsController } from './who-drew-words/who-drew-words.controller';
import { WhoDrewWordsService } from './who-drew-words/who-drew-words.service';
import { AdminNoticesController } from './notices/admin-notices.controller';
import { AdminUsersController } from './users/admin-users.controller';

@Module({
  imports: [NoticesModule, UsersModule],
  controllers: [
    SketchPicWordsController,
    WhoDrewWordsController,
    AdminNoticesController,
    AdminUsersController,
  ],
  providers: [SketchPicWordsService, WhoDrewWordsService],
})
export class AdminModule {}
