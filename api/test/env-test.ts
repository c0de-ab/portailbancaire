import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Charge explicitement api/.env.test (CLAUDE.md, section Intégration continue).
// process.loadEnvFile ne convient pas : Jest donne à chaque fichier de test sa propre copie
// de process.env, que loadEnvFile ne modifie pas. On copie donc les valeurs à la main,
// sans écraser une variable déjà définie (dans la CI, DATABASE_URL vient du workflow).
export function chargerEnvTest(): void {
  const valeurs = parseEnv(readFileSync('.env.test', 'utf8'));
  for (const [nom, valeur] of Object.entries(valeurs)) {
    process.env[nom] ??= valeur;
  }

  // Garde-fou : les tests ne doivent jamais tourner sur la base de développement.
  if (!process.env.DATABASE_URL?.endsWith('/portail_test')) {
    throw new Error('Les tests doivent utiliser la base portail_test (voir api/.env.test).');
  }
}
