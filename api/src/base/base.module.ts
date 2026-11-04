import { Global, Module } from '@nestjs/common';
import { BaseService } from './base.service';

// Global : tous les modules utilisent le même pool de connexions.
@Global()
@Module({
  providers: [BaseService],
  exports: [BaseService],
})
export class BaseModule {}
