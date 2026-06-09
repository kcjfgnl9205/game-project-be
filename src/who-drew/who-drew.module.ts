import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RoomsModule } from '../rooms/rooms.module';
import { WhoDrewStateService } from './who-drew-state.service';
import { WhoDrewService } from './who-drew.service';
import { WhoDrewGateway } from './who-drew.gateway';

@Module({
  imports: [JwtModule.register({}), RoomsModule],
  providers: [WhoDrewStateService, WhoDrewService, WhoDrewGateway],
})
export class WhoDrewModule {}
