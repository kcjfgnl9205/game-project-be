import { Module } from '@nestjs/common';
import { SketchPicWordsController } from './sketch-pic-words/sketch-pic-words.controller';
import { SketchPicWordsService } from './sketch-pic-words/sketch-pic-words.service';

@Module({
  controllers: [SketchPicWordsController],
  providers: [SketchPicWordsService],
})
export class AdminModule {}
