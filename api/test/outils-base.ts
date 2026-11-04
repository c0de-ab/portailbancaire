import { Pool } from 'pg';

// Utilitaires des tests qui touchent la base portail_test. Requêtes paramétrées, comme partout.

// Un pool dédié au fichier de test, à fermer dans afterAll.
export function creerPoolTest(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

// Remet la base à zéro : toutes les tables du modèle, la banque simulée, les sessions et la
// séquence des références. schema_migrations n'est pas touchée : le schéma reste en place.
export async function viderBase(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE teams, users, clients, accounts, requests, request_revisions, decisions,
             events, bank_limits, bank_operations, session
    RESTART IDENTITY CASCADE`);
  await pool.query('ALTER SEQUENCE demande_reference_seq RESTART');
}

// Le minimum pour créer une demande : une équipe, un conseiller, un client et son compte.
export async function creerClientAvecCompte(pool: Pool, numero = 'MA-0001') {
  const equipe = await pool.query<{ id: string }>(
    'INSERT INTO teams (name) VALUES ($1) RETURNING id',
    ['Équipe A'],
  );
  const teamId = equipe.rows[0].id;

  const conseiller = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name, roles, team_id)
     VALUES ($1, 'hachage-factice', 'Conseiller de test', '{CONSEILLER}', $2) RETURNING id`,
    [`conseiller-${numero}@exemple.test`, teamId],
  );
  const conseillerId = conseiller.rows[0].id;

  const utilisateur = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name, roles)
     VALUES ($1, 'hachage-factice', 'Client de test', '{CLIENT}') RETURNING id`,
    [`client-${numero}@exemple.test`],
  );

  const client = await pool.query<{ id: string }>(
    `INSERT INTO clients (user_id, advisor_id, dossier_complet)
     VALUES ($1, $2, true) RETURNING id`,
    [utilisateur.rows[0].id, conseillerId],
  );
  const clientId = client.rows[0].id;

  const compte = await pool.query<{ id: string }>(
    'INSERT INTO accounts (client_id, numero) VALUES ($1, $2) RETURNING id',
    [clientId, numero],
  );
  return { teamId, conseillerId, clientId, compteId: compte.rows[0].id };
}
