import { Module } from '@nestjs/common';
import { BaseModule } from './base/base.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [BaseModule, HealthModule],
})
export class AppModule {}
