import { join } from 'node:path';
import { appliquerMigrations } from '../src/base/migrations';
import { creerPool } from '../src/base/pool';
import { chargerEnvTest } from './env-test';

// Lancé une fois par Jest, avant tous les tests (globalSetup dans package.json) :
// applique les migrations de api/migrations/ sur portail_test. Appel direct de la fonction,
// sans passer par le code compilé. Dans la CI, `npm run migrate` les a déjà appliquées :
// ce second passage n'applique rien.
export default async function migrerBaseTest(): Promise<void> {
  chargerEnvTest();
  const pool = creerPool();
  try {
    await appliquerMigrations(pool, join(__dirname, '..', 'migrations'));
  } finally {
    await pool.end();
  }
}
