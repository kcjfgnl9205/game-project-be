import { Module } from '@nestjs/common';
import { AdminWordsController } from './words/admin-words.controller';
import { AdminWordsService } from './words/admin-words.service';

@Module({
  controllers: [AdminWordsController],
  providers: [AdminWordsService],
})
export class AdminModule {}
