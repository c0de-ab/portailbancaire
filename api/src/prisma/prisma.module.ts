import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global : tous les modules utilisent la même connexion à la base.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
