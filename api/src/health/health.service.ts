import { Injectable } from '@nestjs/common';
import { BaseService } from '../base/base.service';

export type EtatSante = { statut: 'ok'; base: 'ok' } | { statut: 'degrade'; base: 'indisponible' };

@Injectable()
export class HealthService {
  constructor(private readonly base: BaseService) {}

  // Interroge réellement la base : une API démarrée mais sans base n'est pas « ok ».
  async verifier(): Promise<EtatSante> {
    try {
      await this.base.requete('SELECT 1');
      return { statut: 'ok', base: 'ok' };
    } catch {
      return { statut: 'degrade', base: 'indisponible' };
    }
  }
}
