import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { appliquerMigrations } from '../base/migrations';
import { creerPool } from '../base/pool';

// npm run migrate : applique les fichiers de api/migrations/ qui ne le sont pas encore.
// Exécuté sur le code compilé (dist/commands/migrer.js), en local, dans Docker et dans la CI.
async function migrer(): Promise<void> {
  // En local, les variables viennent de api/.env ; dans Docker et la CI, de l'environnement.
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const pool = creerPool();
  try {
    // dist/commands/migrer.js -> api/migrations
    const appliquees = await appliquerMigrations(pool, join(__dirname, '..', '..', 'migrations'));
    console.log(
      appliquees.length === 0
        ? 'Migrations : rien à appliquer.'
        : `Migrations appliquées : ${appliquees.join(', ')}`,
    );
  } finally {
    await pool.end();
  }
}

migrer().catch((erreur: unknown) => {
  // L'erreur complète : une connexion refusée a un message vide, mais un code (ECONNREFUSED).
  console.error('Échec des migrations :', erreur);
  process.exitCode = 1;
});
