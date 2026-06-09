import { Module } from '@nestjs/common';
import { NoticesModule } from '../notices/notices.module';
import { UsersModule } from '../users/users.module';
import { InquiriesModule } from '../inquiries/inquiries.module';
import { SketchPicWordsController } from './sketch-pic-words/sketch-pic-words.controller';
import { SketchPicWordsService } from './sketch-pic-words/sketch-pic-words.service';
import { WhoDrewWordsController } from './who-drew-words/who-drew-words.controller';
import { WhoDrewWordsService } from './who-drew-words/who-drew-words.service';
import { AdminNoticesController } from './notices/admin-notices.controller';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminInquiryCategoriesController } from './inquiries/admin-inquiry-categories.controller';
import { AdminInquiriesController } from './inquiries/admin-inquiries.controller';

@Module({
  imports: [NoticesModule, UsersModule, InquiriesModule],
  controllers: [
    SketchPicWordsController,
    WhoDrewWordsController,
    AdminNoticesController,
    AdminUsersController,
    // categories 라우트가 :id 라우트보다 먼저 등록되어야 함
    AdminInquiryCategoriesController,
    AdminInquiriesController,
  ],
  providers: [SketchPicWordsService, WhoDrewWordsService],
})
export class AdminModule {}
