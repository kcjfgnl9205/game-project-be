import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GameStateService } from './game-state.service';
import { SketchPicService } from './sketch-pic.service';
import { SketchPicGateway } from './sketch-pic.gateway';

@Module({
  imports: [JwtModule.register({})],
  providers: [GameStateService, SketchPicService, SketchPicGateway],
})
export class SketchPicModule {}
