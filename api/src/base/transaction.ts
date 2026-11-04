import type { Pool, PoolClient } from 'pg';

// Exécute `travail` dans une transaction, avec une seule connexion du pool (`tx`).
// Toutes les requêtes de la transaction doivent passer par `tx`, jamais par le pool.
// En cas d'erreur : ROLLBACK, puis l'erreur est relancée. La connexion est toujours rendue.
// Indépendante de NestJS : le script de migration l'utilise aussi.
export async function executerTransaction<T>(
  pool: Pool,
  travail: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    const resultat = await travail(tx);
    await tx.query('COMMIT');
    return resultat;
  } catch (erreur) {
    await tx.query('ROLLBACK');
    throw erreur;
  } finally {
    tx.release();
  }
}
