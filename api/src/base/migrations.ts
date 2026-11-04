import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { executerTransaction } from './transaction';

// Applique les migrations SQL (docs/modele-donnees.md, § 8).
// Un fichier s'appelle NNN_nom.sql ; il est appliqué une seule fois, dans l'ordre des numéros.
const FORMAT_NOM = /^\d{3}_[a-z0-9_]+\.sql$/;

export async function appliquerMigrations(pool: Pool, dossier: string): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nom          text PRIMARY KEY,
      appliquee_le timestamptz NOT NULL DEFAULT now()
    )`);

  const fichiers = readdirSync(dossier).filter((nom) => nom.endsWith('.sql'));
  // Un nom mal formé fait échouer le script, au lieu d'être ignoré sans rien dire.
  const malFormes = fichiers.filter((nom) => !FORMAT_NOM.test(nom));
  if (malFormes.length > 0) {
    throw new Error(`Nom de migration invalide (attendu : NNN_nom.sql) : ${malFormes.join(', ')}`);
  }
  // Trois chiffres en tête : l'ordre alphabétique est l'ordre des numéros.
  fichiers.sort();

  const resultat = await pool.query<{ nom: string }>('SELECT nom FROM schema_migrations');
  const dejaAppliquees = new Set(resultat.rows.map((ligne) => ligne.nom));

  const appliquees: string[] = [];
  for (const nom of fichiers) {
    if (dejaAppliquees.has(nom)) {
      continue;
    }
    const sql = readFileSync(join(dossier, nom), 'utf8');
    // Le contenu et son enregistrement dans une même transaction :
    // une migration est appliquée entièrement, ou pas du tout.
    await executerTransaction(pool, async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (nom) VALUES ($1)', [nom]);
    });
    appliquees.push(nom);
  }
  return appliquees;
}
