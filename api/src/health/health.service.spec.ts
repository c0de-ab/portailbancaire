import { HealthService } from './health.service';
import type { BaseService } from '../base/base.service';

// Test unitaire : aucune base. Le service d'accès est remplacé par un double
// qui réussit ou échoue à la demande.
function serviceAvec(requete: () => Promise<unknown>): HealthService {
  const base = { requete } as unknown as BaseService;
  return new HealthService(base);
}

describe('HealthService', () => {
  it('indique ok quand la base répond', async () => {
    const service = serviceAvec(() => Promise.resolve({ rows: [{ '?column?': 1 }] }));

    await expect(service.verifier()).resolves.toEqual({ statut: 'ok', base: 'ok' });
  });

  it('indique la base indisponible quand la requête échoue', async () => {
    const service = serviceAvec(() => Promise.reject(new Error('connexion refusée')));

    await expect(service.verifier()).resolves.toEqual({
      statut: 'degrade',
      base: 'indisponible',
    });
  });
});
