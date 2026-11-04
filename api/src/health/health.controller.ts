import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { EtatSante, HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // GET /api/health : 200 si la base répond, 503 sinon (avec le même format de corps).
  @Get()
  async lire(): Promise<EtatSante> {
    const etat = await this.health.verifier();
    if (etat.base !== 'ok') {
      throw new ServiceUnavailableException(etat);
    }
    return etat;
  }
}
