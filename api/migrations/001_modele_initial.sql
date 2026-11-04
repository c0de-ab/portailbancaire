-- 001 : modèle initial (docs/modele-donnees.md).
-- Tables, colonnes et valeurs exactement comme dans le document.
-- created_at et updated_at n'ont pas de valeur par défaut : les services écrivent `maintenant`
-- (CLAUDE.md, règle 9), et une date oubliée fait échouer l'insertion.
-- Rien n'est jamais supprimé : toutes les clés étrangères sont en ON DELETE RESTRICT.

-- ---------------------------------------------------------------------------
-- Valeurs des statuts (§ 2)
-- ---------------------------------------------------------------------------

CREATE TYPE role AS ENUM ('CLIENT', 'CONSEILLER', 'SUPERVISEUR');

-- État métier de la demande.
CREATE TYPE statut_demande AS ENUM (
  'BROUILLON', 'SOUMISE', 'COMPLEMENT_DEMANDE', 'ATTENTE_SUPERVISEUR', 'APPROUVEE',
  'ACTIVE', 'EXPIREE', 'REJETEE', 'ANNULEE', 'ABANDONNEE'
);

-- Résultat d'exécution d'une opération bancaire (activation ou désactivation).
CREATE TYPE statut_execution AS ENUM ('EN_ATTENTE', 'REUSSIE', 'ECHEC', 'INCONNU');

CREATE TYPE type_decision AS ENUM (
  'DEMANDE_COMPLEMENT', 'APPROBATION', 'REJET',
  'RECOMMANDATION_FAVORABLE', 'RECOMMANDATION_DEFAVORABLE'
);

CREATE TYPE operation_bancaire AS ENUM ('ACTIVER', 'DESACTIVER');

-- ---------------------------------------------------------------------------
-- Utilisateurs et périmètres
-- ---------------------------------------------------------------------------

-- L'équipe d'un superviseur et de ses conseillers.
CREATE TABLE teams (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  -- Argon2id.
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  -- Une liste : un même utilisateur peut être conseiller et superviseur (R9).
  roles         role[] NOT NULL,
  -- Nul pour un client.
  team_id       uuid REFERENCES teams (id) ON DELETE RESTRICT
);

CREATE TABLE clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Le compte de connexion du client.
  user_id         uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE RESTRICT,
  -- Définit le portefeuille du conseiller.
  advisor_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- Porte R5 : un dossier incomplet empêche la soumission.
  dossier_complet boolean NOT NULL
);

CREATE TABLE accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES clients (id) ON DELETE RESTRICT,
  -- Numéro fictif.
  numero          text NOT NULL UNIQUE,
  plafond_initial integer NOT NULL DEFAULT 10000
);

-- ---------------------------------------------------------------------------
-- Demandes
-- ---------------------------------------------------------------------------

CREATE TABLE requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Attribuée à la première soumission (H13) ; nulle pour un brouillon.
  -- L'unicité accepte plusieurs valeurs nulles.
  reference            text UNIQUE,
  account_id           uuid NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  -- Recopié du compte à la création du brouillon.
  client_id            uuid NOT NULL REFERENCES clients (id) ON DELETE RESTRICT,
  -- Fixés à la première soumission, puis ne changent plus (H9).
  advisor_id           uuid REFERENCES users (id) ON DELETE RESTRICT,
  team_id              uuid REFERENCES teams (id) ON DELETE RESTRICT,
  statut               statut_demande NOT NULL DEFAULT 'BROUILLON',
  -- Compteur technique du contrôle de concurrence, jamais affiché (H14).
  version              integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- Copie de travail : nullable, car un brouillon peut être incomplet.
  -- Aucun CHECK sur les règles métier : un brouillon peut les enfreindre (avertissements, H23).
  plafond_demande      integer,
  duree_jours          integer,
  motif                text,
  -- Nom généré par le serveur (uuid + extension) ; le nom d'origine sert à l'affichage seul.
  justificatif_fichier text,
  justificatif_nom     text,
  -- 0 tant qu'aucune révision n'existe ; 1 à la première soumission.
  revision_courante    integer NOT NULL DEFAULT 0 CHECK (revision_courante >= 0),
  recommender_id       uuid REFERENCES users (id) ON DELETE RESTRICT,
  -- Résultats d'exécution : nuls tant que l'opération n'a pas commencé.
  activation_statut    statut_execution,
  desactivation_statut statut_execution,
  derniere_erreur      text,
  submitted_at         timestamptz,
  date_activation      timestamptz,
  date_echeance        timestamptz,
  created_at           timestamptz NOT NULL,
  updated_at           timestamptz NOT NULL
);

-- R6 : une seule demande en cours par compte, même en cas de soumissions simultanées.
CREATE UNIQUE INDEX uq_demande_en_cours ON requests (account_id)
  WHERE statut IN ('SOUMISE', 'COMPLEMENT_DEMANDE', 'ATTENTE_SUPERVISEUR', 'APPROUVEE', 'ACTIVE');

-- H1 : un seul brouillon par compte.
CREATE UNIQUE INDEX uq_brouillon_unique ON requests (account_id)
  WHERE statut = 'BROUILLON';

-- H13 : numéro des références (DEM-<année>-<numéro sur 6 chiffres>), tiré à la première
-- soumission. Une seule séquence, jamais remise à zéro.
CREATE SEQUENCE demande_reference_seq;

-- Instantané du contenu à chaque soumission et resoumission.
CREATE TABLE request_revisions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id           uuid NOT NULL REFERENCES requests (id) ON DELETE RESTRICT,
  -- Version métier, affichée à l'utilisateur (v1, v2…).
  revision_no          integer NOT NULL CHECK (revision_no >= 1),
  plafond_demande      integer NOT NULL,
  duree_jours          integer NOT NULL,
  motif                text NOT NULL,
  justificatif_fichier text,
  justificatif_nom     text,
  created_by           uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL,
  UNIQUE (request_id, revision_no)
);

-- Les décisions humaines, toujours motivées (R10).
CREATE TABLE decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES requests (id) ON DELETE RESTRICT,
  type            type_decision NOT NULL,
  actor_id        uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- Écrit par le serveur, déduit de l'action et de l'état (H18).
  actor_role      role NOT NULL,
  motif           text NOT NULL,
  -- Version du dossier sur laquelle porte la décision.
  request_version integer NOT NULL,
  revision_no     integer NOT NULL,
  created_at      timestamptz NOT NULL,
  -- Une seule décision par version : deux décisions concurrentes ne peuvent pas coexister.
  UNIQUE (request_id, request_version)
);

-- ---------------------------------------------------------------------------
-- Historique
-- ---------------------------------------------------------------------------

CREATE TABLE events (
  id              bigserial PRIMARY KEY,
  -- Nul pour un événement sans dossier (consultation du plafond, refus d'accès).
  request_id      uuid REFERENCES requests (id) ON DELETE RESTRICT,
  -- Nulle pour les événements d'un brouillon (H13).
  reference       text,
  -- Nul pour le système ; sinon l'utilisateur pour qui l'action est faite.
  actor_id        uuid REFERENCES users (id) ON DELETE RESTRICT,
  via_agent       boolean NOT NULL DEFAULT false,
  action          text NOT NULL,
  request_version integer,
  motif           text,
  -- Jamais de secret ni de conversation complète.
  details         jsonb,
  -- Toujours l'heure réelle (H22).
  created_at      timestamptz NOT NULL
);

CREATE INDEX events_request_id_created_at_idx ON events (request_id, created_at);

-- Sessions serveur : structure exacte du fichier table.sql de connect-pg-simple (10.0.0).
-- La table est créée ici, et non par connect-pg-simple (option createTableIfMissing désactivée).
CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "IDX_session_expire" ON "session" ("expire");

-- ---------------------------------------------------------------------------
-- Banque simulée : aucune clé étrangère vers l'application (frontière logique, § 2).
-- ---------------------------------------------------------------------------

CREATE TABLE bank_limits (
  numero          text PRIMARY KEY,
  -- Le plafond réellement appliqué « côté banque ».
  plafond_courant integer NOT NULL
);

-- Mémoire des opérations déjà traitées, par clé d'idempotence (act-<id>, desact-<id>).
CREATE TABLE bank_operations (
  cle              text PRIMARY KEY,
  numero           text NOT NULL REFERENCES bank_limits (numero) ON DELETE RESTRICT,
  operation        operation_bancaire NOT NULL,
  plafond_applique integer NOT NULL,
  -- Contient la date d'application de l'opération (H17).
  resultat         jsonb NOT NULL,
  created_at       timestamptz NOT NULL
);
