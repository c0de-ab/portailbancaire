import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { appliquerMigrations } from '../src/base/migrations';

// Tests du script de migration, sur la vraie base portail_test. Chaque test travaille dans un
// schéma PostgreSQL temporaire (search_path) avec des migrations factices : il ne touche ni aux
// vraies tables, ni à la vraie table schema_migrations.
describe('Migrations SQL', () => {
  let admin: Pool;
  let pool: Pool;
  let schema: string;
  let dossier: string;

  function ecrireMigration(nom: string, sql: string): void {
    writeFileSync(join(dossier, nom), sql);
  }

  // Les tables présentes dans le schéma temporaire.
  async function tables(): Promise<string[]> {
    const resultat = await admin.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      [schema],
    );
    return resultat.rows.map((ligne) => ligne.table_name);
  }

  beforeAll(() => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  beforeEach(async () => {
    // Nom généré par le test lui-même (jamais une entrée) : seul cas où un identifiant
    // est inséré dans le texte d'une requête, car un nom de schéma ne peut pas être un paramètre.
    schema = `test_migrations_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    dossier = mkdtempSync(join(tmpdir(), 'portail-migrations-'));
  });

  afterEach(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    rmSync(dossier, { recursive: true, force: true });
  });

  afterAll(async () => {
    await admin.end();
  });

  it('applique les fichiers dans l’ordre de leur numéro et les enregistre', async () => {
    // 002 dépend de 001 : il échouerait s'il passait en premier.
    ecrireMigration(
      '002_enfant.sql',
      'CREATE TABLE enfant (parent_id int REFERENCES parent (id));',
    );
    ecrireMigration('001_parent.sql', 'CREATE TABLE parent (id int PRIMARY KEY);');

    await expect(appliquerMigrations(pool, dossier)).resolves.toEqual([
      '001_parent.sql',
      '002_enfant.sql',
    ]);
    await expect(tables()).resolves.toEqual(['enfant', 'parent', 'schema_migrations']);
  });

  it('un second lancement n’applique rien', async () => {
    ecrireMigration('001_parent.sql', 'CREATE TABLE parent (id int PRIMARY KEY);');
    await appliquerMigrations(pool, dossier);

    await expect(appliquerMigrations(pool, dossier)).resolves.toEqual([]);
  });

  it('une migration en erreur n’est ni appliquée ni enregistrée', async () => {
    ecrireMigration('001_parent.sql', 'CREATE TABLE parent (id int PRIMARY KEY);');
    // La première instruction réussirait seule : le ROLLBACK doit l'annuler.
    ecrireMigration('002_casse.sql', 'CREATE TABLE orpheline (id int); SELECT * FROM inexistante;');

    await expect(appliquerMigrations(pool, dossier)).rejects.toThrow(/inexistante/);

    await expect(tables()).resolves.toEqual(['parent', 'schema_migrations']);
    const enregistrees = await pool.query<{ nom: string }>('SELECT nom FROM schema_migrations');
    expect(enregistrees.rows.map((ligne) => ligne.nom)).toEqual(['001_parent.sql']);
  });

  it('un nom de fichier mal formé fait échouer le script avant toute migration', async () => {
    ecrireMigration('001_parent.sql', 'CREATE TABLE parent (id int PRIMARY KEY);');
    ecrireMigration('2_mal_nomme.sql', 'CREATE TABLE autre (id int);');

    await expect(appliquerMigrations(pool, dossier)).rejects.toThrow(/2_mal_nomme\.sql/);

    await expect(tables()).resolves.toEqual(['schema_migrations']);
  });
});
