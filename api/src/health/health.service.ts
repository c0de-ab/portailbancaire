import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type EtatSante = { statut: 'ok'; base: 'ok' } | { statut: 'degrade'; base: 'indisponible' };

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  // Interroge réellement la base : une API démarrée mais sans base n'est pas « ok ».
  async verifier(): Promise<EtatSante> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { statut: 'ok', base: 'ok' };
    } catch {
      return { statut: 'degrade', base: 'indisponible' };
    }
  }
}
