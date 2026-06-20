import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RoomsModule } from '../rooms/rooms.module';
import { WordChainStateService } from './word-chain-state.service';
import { WordChainService } from './word-chain.service';
import { WordChainGateway } from './word-chain.gateway';

@Module({
  imports: [JwtModule.register({}), RoomsModule],
  providers: [WordChainStateService, WordChainService, WordChainGateway],
})
export class WordChainModule {}
