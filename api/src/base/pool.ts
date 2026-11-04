import { Pool } from 'pg';

// Le pool de connexions, créé à partir de DATABASE_URL. Partagé par l'application
// (BaseService) et par le script de migration.
export function creerPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL doit être défini (voir .env.example).');
  }
  return new Pool({
    connectionString,
    // Une base injoignable doit produire une erreur rapide, pas une attente.
    connectionTimeoutMillis: 3000,
  });
}
