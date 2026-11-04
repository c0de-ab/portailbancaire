import type { Pool } from 'pg';
import { creerClientAvecCompte, creerPoolTest, viderBase } from './outils-base';

// Tests du schéma, sur la vraie base portail_test : ils vérifient les garanties que la base
// apporte seule (docs/modele-donnees.md, § 4). Chaque refus est vérifié par son code PostgreSQL
// et par le nom de la contrainte : on sait ainsi que c'est la bonne règle qui a bloqué.
// Les tests par les routes viendront avec les services.

type StatutDemande =
  | 'BROUILLON'
  | 'SOUMISE'
  | 'COMPLEMENT_DEMANDE'
  | 'ATTENTE_SUPERVISEUR'
  | 'APPROUVEE'
  | 'ACTIVE'
  | 'EXPIREE'
  | 'REJETEE'
  | 'ANNULEE'
  | 'ABANDONNEE';

const MAINTENANT = new Date('2026-11-04T10:00:00Z');

describe('Schéma : garanties de la base', () => {
  let pool: Pool;
  let compteId: string;
  let clientId: string;
  let conseillerId: string;

  // Crée une demande sur un compte, directement dans l'état voulu.
  function creerDemande(statut: StatutDemande, reference: string | null = null, compte = compteId) {
    return pool.query<{ id: string; version: number }>(
      `INSERT INTO requests (account_id, client_id, statut, reference, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5) RETURNING id, version`,
      [compte, clientId, statut, reference, MAINTENANT],
    );
  }

  beforeAll(() => {
    pool = creerPoolTest();
  });

  beforeEach(async () => {
    await viderBase(pool);
    ({ compteId, clientId, conseillerId } = await creerClientAvecCompte(pool));
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('H1 : un seul brouillon par compte (uq_brouillon_unique)', () => {
    it('refuse un second brouillon sur le même compte', async () => {
      await creerDemande('BROUILLON');

      await expect(creerDemande('BROUILLON')).rejects.toMatchObject({
        code: '23505',
        constraint: 'uq_brouillon_unique',
      });
    });

    it('accepte un brouillon à côté d’une demande soumise (R6 commence à la soumission)', async () => {
      await creerDemande('SOUMISE');

      await expect(creerDemande('BROUILLON')).resolves.toBeDefined();
    });
  });

  describe('R6 : une seule demande en cours par compte (uq_demande_en_cours)', () => {
    it.each<StatutDemande>([
      'SOUMISE',
      'COMPLEMENT_DEMANDE',
      'ATTENTE_SUPERVISEUR',
      'APPROUVEE',
      'ACTIVE',
    ])('refuse une demande soumise quand une demande %s existe déjà', async (statutExistant) => {
      await creerDemande(statutExistant);

      await expect(creerDemande('SOUMISE')).rejects.toMatchObject({
        code: '23505',
        constraint: 'uq_demande_en_cours',
      });
    });

    it.each<StatutDemande>(['EXPIREE', 'REJETEE', 'ANNULEE', 'ABANDONNEE'])(
      'accepte une nouvelle demande soumise à côté d’une demande %s',
      async (statutFinal) => {
        await creerDemande(statutFinal);

        await expect(creerDemande('SOUMISE')).resolves.toBeDefined();
      },
    );

    it('deux soumissions simultanées ne créent qu’une demande en cours', async () => {
      const resultats = await Promise.allSettled([
        creerDemande('SOUMISE'),
        creerDemande('SOUMISE'),
      ]);

      expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const refusees = resultats.filter((r) => r.status === 'rejected');
      expect(refusees).toHaveLength(1);
      expect(refusees[0].reason).toMatchObject({
        code: '23505',
        constraint: 'uq_demande_en_cours',
      });
      const enCours = await pool.query("SELECT 1 FROM requests WHERE statut = 'SOUMISE'");
      expect(enCours.rowCount).toBe(1);
    });
  });

  describe('Une seule décision par version (decisions : request_id, request_version)', () => {
    it('refuse une seconde décision sur la même version du dossier', async () => {
      const { rows } = await creerDemande('SOUMISE', 'DEM-2026-000001');
      const demande = rows[0];
      const decider = (type: 'APPROBATION' | 'REJET') =>
        pool.query(
          `INSERT INTO decisions
             (request_id, type, actor_id, actor_role, motif, request_version, revision_no, created_at)
           VALUES ($1, $2, $3, 'CONSEILLER', 'Motif de test', $4, 1, $5)`,
          [demande.id, type, conseillerId, demande.version, MAINTENANT],
        );

      await decider('APPROBATION');

      await expect(decider('REJET')).rejects.toMatchObject({
        code: '23505',
        constraint: 'decisions_request_id_request_version_key',
      });
    });
  });

  describe('Référence (H13)', () => {
    it('accepte plusieurs demandes sans référence, mais jamais deux fois la même', async () => {
      const autre = await creerClientAvecCompte(pool, 'MA-0002');
      await creerDemande('BROUILLON');
      await creerDemande('BROUILLON', null, autre.compteId);
      const sansReference = await pool.query('SELECT 1 FROM requests WHERE reference IS NULL');
      expect(sansReference.rowCount).toBe(2);

      await creerDemande('EXPIREE', 'DEM-2026-000001');
      await expect(creerDemande('ANNULEE', 'DEM-2026-000001')).rejects.toMatchObject({
        code: '23505',
        constraint: 'requests_reference_key',
      });
    });

    it('la séquence des références donne des numéros croissants', async () => {
      // pg renvoie un bigint sous forme de texte.
      const tirer = async () =>
        (await pool.query<{ numero: string }>("SELECT nextval('demande_reference_seq') AS numero"))
          .rows[0].numero;

      await expect(tirer()).resolves.toBe('1');
      await expect(tirer()).resolves.toBe('2');
    });
  });

  describe('Valeurs initiales et intégrité', () => {
    it('une demande commence en brouillon, version 1, sans révision ni référence', async () => {
      const { rows } = await pool.query(
        `INSERT INTO requests (account_id, client_id, created_at, updated_at)
         VALUES ($1, $2, $3, $3)
         RETURNING statut, version, revision_courante, reference, activation_statut`,
        [compteId, clientId, MAINTENANT],
      );

      expect(rows[0]).toEqual({
        statut: 'BROUILLON',
        version: 1,
        revision_courante: 0,
        reference: null,
        activation_statut: null,
      });
    });

    it('refuse une demande sans date de création : une date oubliée par un service échoue', async () => {
      await expect(
        pool.query('INSERT INTO requests (account_id, client_id, updated_at) VALUES ($1, $2, $3)', [
          compteId,
          clientId,
          MAINTENANT,
        ]),
      ).rejects.toMatchObject({ code: '23502', column: 'created_at' });
    });

    it('refuse un statut inconnu (enum statut_demande)', async () => {
      await expect(creerDemande('VALIDEE' as StatutDemande)).rejects.toMatchObject({
        code: '22P02',
      });
    });

    it('refuse de supprimer un compte qui a une demande : rien n’est jamais supprimé', async () => {
      await creerDemande('BROUILLON');

      await expect(
        pool.query('DELETE FROM accounts WHERE id = $1', [compteId]),
      ).rejects.toMatchObject({ code: '23503', constraint: 'requests_account_id_fkey' });
    });
  });
});
