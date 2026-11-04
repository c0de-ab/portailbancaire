import { HealthService } from './health.service';
import type { PrismaService } from '../prisma/prisma.service';

// Test unitaire : aucune base. Le client Prisma est remplacé par un double
// qui réussit ou échoue à la demande.
function serviceAvec(requete: () => Promise<unknown>): HealthService {
  const prisma = { $queryRaw: requete } as unknown as PrismaService;
  return new HealthService(prisma);
}

describe('HealthService', () => {
  it('indique ok quand la base répond', async () => {
    const service = serviceAvec(() => Promise.resolve([{ '?column?': 1 }]));

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
