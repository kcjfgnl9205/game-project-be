import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RoomsModule } from '../rooms/rooms.module';
import { SketchPicStateService } from './sketch-pic-state.service';
import { SketchPicService } from './sketch-pic.service';
import { SketchPicGateway } from './sketch-pic.gateway';

@Module({
  imports: [JwtModule.register({}), RoomsModule],
  providers: [SketchPicStateService, SketchPicService, SketchPicGateway],
})
export class SketchPicModule {}
