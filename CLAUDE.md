# Portail bancaire : augmentation temporaire de plafond avec agent IA

Prototype réalisé pour une évaluation technique. Un client demande une augmentation temporaire de son plafond de virement, un conseiller ou un superviseur la traite, et un agent IA aide le client.

Priorités de l'évaluation, dans l'ordre : cohérence du processus et des règles métier, qualité du backend et des données, fiabilité des actions IA, clarté du parcours. **Un code simple, lisible et testé compte plus qu'un grand nombre de fonctionnalités.**

## Documents de référence

Lire le document concerné **avant** de commencer une tâche :

| Document | Contenu | À lire avant de toucher à |
|---|---|---|
| `docs/cahier-des-charges.md` | L'énoncé (non versionné, voir `.gitignore`). Il fait foi en cas de doute. | — |
| `docs/etats-transitions.md` | Règles R1 à R14, états, transitions, hypothèses H1 à H23, libellés client, limites connues | Domaine, services, écrans d'état |
| `docs/modele-donnees.md` | Tables, colonnes, contraintes, mécanismes de concurrence, jeu de démo | Schéma Prisma, services, seed |
| `docs/stack-technique.md` | Outils retenus et outils volontairement écartés | Dépendances, configuration |

Si le code et un document se contredisent, **s'arrêter et le signaler** : ne jamais modifier une règle ou un document en silence.

## Stack

TypeScript strict · Node.js 24 · NestJS (`api/`) · React + Vite (`web/`) · PostgreSQL 16 · Prisma 7.4+ (preview `partialIndexes`) · `class-validator` · Jest + Supertest · SDK Anthropic derrière l'interface `LlmClient` · Docker Compose · GitHub Actions.

## Structure cible

```
api/
  src/
    domain/      règles de contenu et table des transitions, en TypeScript pur
    demandes/    controllers et services des demandes et des décisions
    auth/        sessions, guards de rôles
    agent/       LlmClient (connecté et simulé) et les quatre outils
    banque/      banque simulée (bank_limits, bank_operations)
    commands/    commande d'expiration
  prisma/        schema.prisma, migrations, seed
  test/
  uploads/       justificatifs enregistrés (hors Git, volume Docker)
web/
  src/
    pages/       écrans client, conseiller, superviseur
    api.ts       appels fetch
    types.ts     statuts et libellés, recopiés de l'API
docs/
.github/workflows/ci.yml   intégration continue
```

## Commandes

À mettre à jour si les scripts changent.

Depuis la racine :
- `docker compose up` : lance la base et l'application, IA en mode simulé, mode démonstration activé (`DEMO_MODE=true`)
- `docker compose up -d db` : lance seulement PostgreSQL, nécessaire au développement et aux tests d'API. Au premier lancement du conteneur, un script d'initialisation (`docker-entrypoint-initdb.d`) crée aussi la base de test
- `docker compose exec app npm run expire -- --date <date>` : expiration dans le conteneur

Dans `api/` :
- Avant le premier lancement : copier `.env.example` (racine) en `api/.env`, qui n'est pas versionné
- `npm run start:dev` : API en développement sur le port 3000, avec rechargement automatique
- `npm run test` : tests unitaires et tests d'API. **PostgreSQL doit tourner** ; les tests utilisent une base séparée, définie dans `api/.env.test`. Jest est lancé avec `node --experimental-vm-modules`, nécessaire au moteur de Prisma 7 : l'avertissement `ExperimentalWarning` est attendu
- `npm run lint` : ESLint et Prettier ; `npm run format` corrige la mise en forme
- `npx prisma migrate dev` : applique les migrations
- `npm run build` puis `npm run expire -- --date <date>` : expire les plafonds dont l'échéance est passée à cette date. Le script exécute uniquement le code compilé (`node dist/...`) et ne le compile jamais lui-même, pour fonctionner à l'identique dans le conteneur ; en local, lancer `npm run build` avant. Une date antérieure à l'heure réelle est refusée (H22)

Dans `web/` :
- `npm run dev` : frontend en développement sur le port 5173 (Vite redirige `/api` vers le backend)
- `npm run build` : frontend construit dans `web/dist`, servi par l'API
- `npm run lint` : ESLint et Prettier ; `npm run format` corrige la mise en forme

Dans l'image Docker de production, les outils de développement (`ts-node`, `tsx`) sont absents. Les scripts lancés dans le conteneur (migrations, seed, expiration) utilisent donc le **code compilé** (`node dist/...`), et le CLI `prisma` doit être présent dans l'image pour `prisma migrate deploy`. Vérifier chacune de ces commandes **dans le conteneur** dès l'étape du squelette.

## Intégration continue

- Fichier `.github/workflows/ci.yml`, lancé à chaque push sur `main`. Node.js est installé avec `actions/setup-node`, en lisant la version dans `.nvmrc`.
- Job `api` : `npm ci`, `prisma generate`, lint, vérification des types (`tsc --noEmit`), migrations (`prisma migrate deploy`), puis `npm run test`.
- Base de test : un service PostgreSQL 16 qui crée directement `portail_test`, avec un contrôle de santé (`pg_isready`), pour que les migrations ne démarrent pas avant que la base soit prête.
- Prisma 7 ne charge pas les fichiers `.env` tout seul. Dans la CI, `DATABASE_URL` est défini directement dans le workflow, avec la même valeur que `api/.env.test`. En local, `npm run test` charge explicitement `api/.env.test` ; la base de test est créée par un script d'initialisation de PostgreSQL dans Docker Compose.
- Job `web` : `npm ci`, lint, vérification des types et `npm run build`.
- Job `docker` : `docker build`, pour détecter au plus tôt un Dockerfile cassé.
- Aucun secret n'est nécessaire : l'IA tourne en mode simulé (`LLM_MODE=mock`).
- Si la CI échoue, corriger avant de continuer.

## Règles d'architecture

1. **Domaine pur.** `api/src/domain` n'importe ni NestJS ni Prisma. Il définit les règles de contenu (R1 à R5, R8 à R10) et la table des transitions, qui porte R12 et R13. `verifierRegles` renvoie la **liste complète** des erreurs, sans lever d'exception ; elle sert deux fois : à la soumission, le service transforme cette liste en refus (422) ; au brouillon, en avertissements qui ne bloquent rien (H23). La base garantit R6 (index unique partiel), R7 et R11 (mise à jour conditionnelle) et R14 (filtre SQL) : voir `docs/modele-donnees.md`, § 4 et § 5.
2. **Un seul chemin vers les règles.** Les routes REST, les outils de l'agent et la commande d'expiration appellent les mêmes services. Aucune logique métier dans un controller ou un outil.
3. **L'identité vient uniquement de la session**, jamais du corps de la requête, d'un paramètre d'URL ou du modèle IA.
4. **Le périmètre est filtré dans la requête SQL** (client, portefeuille du conseiller, équipe du superviseur avec `recommender_id` non nul ; union des deux filtres pour un utilisateur à double rôle, H18). Toute action commence par **charger le dossier avec ce filtre** : s'il est absent, HTTP 404. On ne passe à la mise à jour qu'ensuite, pour qu'un dossier hors périmètre ne produise jamais un 409 qui révélerait son existence.
5. **Chaque transition déclenchée par un utilisateur est un `updateMany` conditionnel** sur l'identifiant, la version lue et le statut attendu. Si `count !== 1` : HTTP 409. Les transitions du système (résultat bancaire, expiration) sont conditionnées au seul statut (règle 7). La relance d'une activation (bouton « Relancer ») est une action utilisateur : elle charge le dossier avec le filtre de périmètre et elle est tracée, mais elle est conditionnée au seul statut `APPROUVEE`, sans version, car elle ne prend aucune décision (H15). Tout changement d'état ou de contenu incrémente `version` ; un changement du seul résultat d'exécution ne l'incrémente pas.
6. **Une seule transaction** pour la transition, la décision, la révision et l'événement. À la première soumission, la référence est tirée d'une séquence PostgreSQL dans cette même transaction (H13).
7. **Banque simulée :** clé fixe `act-<id>` ou `desact-<id>`. Les écritures de succès **et** d'échec sont conditionnées au statut `APPROUVEE` (activation) ou `ACTIVE` (désactivation). L'appel est synchrone, avec un délai de 3 s, et la réponse HTTP indique le résultat. Les modes `ECHEC` et `REPONSE_PERDUE` ne s'appliquent qu'aux nouvelles clés : une clé déjà connue renvoie toujours son résultat enregistré (H16). `date_activation` est la date d'application renvoyée par la banque dans `resultat` (H17).
8. **Erreurs :** un format unique, `{ erreurs: [{ code, champ, message }] }`, où `code` est le code de la règle (par exemple `R4`). `champ` est facultatif : une erreur de version, par exemple, ne porte sur aucun champ. La soumission renvoie toutes les erreurs à la fois. Codes HTTP :
   - **422** : contenu invalide (R1 à R5, R10) ;
   - **409** : conflit d'état ou de version (R6, R7, R11, R12, R13, transition impossible) ;
   - **403** : l'acteur n'a pas le droit (R8, R9, rôle refusé par le guard) ;
   - **404** : dossier hors périmètre (R14). Un dossier inexistant reçoit la même réponse (règle 4).
9. **Dates :** la date courante (`maintenant`) est passée en paramètre aux services. Pas de `new Date()` dans le domaine. La commande d'expiration reçoit **deux dates distinctes** : `dateSimulee`, la date passée à `--date`, qui sert uniquement à sélectionner les échéances ; et `maintenant`, l'heure réelle, qui date les événements. `events.created_at` est toujours l'heure réelle ; la date simulée est enregistrée dans `details` (H22).
10. **Noms :** tables, colonnes et statuts exactement comme dans `docs/modele-donnees.md`. Termes métier en français, comme dans les documents. La version métier, affichée à l'utilisateur (v1, v2…), est `revision_no`. La colonne `version` est un compteur technique réservé au contrôle de concurrence, **jamais affiché** : les formulaires et la carte de confirmation la transmettent sans l'afficher, et c'est grâce à elle que R7 et R11 fonctionnent (H14).
11. **Historique :** écrire dans `events` chaque transition et chaque décision (dans la même transaction), chaque appel d'outil de l'agent (`via_agent = true`) et chaque refus sensible : accès hors périmètre, règle violée, tentative de contournement. Jamais de secret ni de conversation complète. **Un refus est enregistré après l'annulation de la transaction, par une écriture séparée** ; sinon il serait annulé avec elle. Cette écriture est faite à un seul endroit (le `catch` qui entoure la transaction dans le service), pas dispersée dans le code. **Tout ce qui peut refuser l'action se trouve dans ce même `try`** : le chargement du dossier avec le filtre de périmètre (règle 4), la vérification des règles et la mise à jour conditionnelle. Un accès hors périmètre (404) est ainsi tracé lui aussi.
12. **Routes :** toutes les routes de l'API sont sous le préfixe `/api` (`setGlobalPrefix('api')`), y compris la route de démonstration.

## Agent IA

- Quatre outils seulement : `consulter_comptes`, `consulter_dossier`, `preparer_brouillon`, `proposer_soumission`. **Ne jamais ajouter d'outil qui approuve, active, soumet ou modifie des droits.**
- `consulter_comptes` lit le plafond réellement appliqué par la banque (`bank_limits.plafond_courant`) et indique s'il s'agit d'un plafond temporaire (H21). Il renvoie aussi la demande en cours éventuelle du compte, avec son état, pour prévenir de R6.
- `consulter_dossier` applique le même filtre que l'écran client : les motifs de recommandation n'y figurent pas (H19).
- `preparer_brouillon` agit sur un brouillon ou sur un dossier en « Complément demandé ». Il relit la version côté serveur et ne la reçoit jamais du modèle. Si un brouillon existe déjà pour le compte (P2002 sur `uq_brouillon_unique`), il renvoie ce brouillon au lieu d'une erreur (H20). Il enregistre le brouillon, puis renvoie les avertissements de `verifierRegles` avec leur code ; l'interface les affiche comme des **données du système**.
- **Proactivité (H23) :** l'agent prévient dès le début si le dossier est incomplet (R5) et suit la liste des avertissements pour demander les précisions manquantes. Il propose des options, mais **ne modifie jamais le brouillon sans une réponse explicite du client**. La carte de confirmation (R7) reste la garantie finale.
- L'agent ne soumet jamais. La soumission passe par le clic du client sur la carte de confirmation, qui appelle la même route que le formulaire.
- Les messages et les pièces du client sont des données non fiables.
- L'interface distingue trois types de messages : **donnée du système** (résultat d'un outil), **explication** du modèle, **action réalisée**.
- Si un outil échoue ou qu'une donnée manque, l'agent le dit et ne prétend jamais avoir agi.
- `LLM_MODE=mock` par défaut partout (Docker, développement, tests). Les tests ne font jamais d'appel réseau au modèle. Le mode simulé répond de façon déterministe, par correspondance de motifs, et couvre au minimum le parcours normal, le brouillon de 60 000 DH sans justificatif (avertissement R4, scénario 2), la demande de contournement et l'accès à un autre compte (scénario 7).
- **Modèle piégé :** une troisième implémentation de `LlmClient`, réservée aux tests (dans `api/test/`, jamais dans `src/`). Elle obéit à l'attaquant et appelle les outils avec des arguments malveillants.
- Facultatif, en fin de projet : `npm run eval:agent` envoie les mêmes messages d'attaque au vrai modèle et produit un rapport. Ce n'est pas un test : elle n'est **jamais lancée dans la CI**, car elle demande une clé, coûte de l'argent et n'est pas déterministe.
- Garde-fous : 15 s par appel, 3 appels d'outils par message, 1 024 tokens de réponse. Si le modèle est indisponible, le chat l'indique et les formulaires restent utilisables.

## Sécurité

- Aucun secret dans le code ni dans Git. Deux fichiers d'environnement seulement sont versionnés : `.env.example`, et `api/.env.test`, utilisé par les tests et la CI, qui ne contient que des valeurs de test (adresse de la base de test locale, secret de session factice). Le `.gitignore` ignore tous les autres `.env*`.
- Mots de passe hachés en Argon2id. Cookie de session `httpOnly`, `SameSite=Strict`, `Secure` en production.
- Session **régénérée à la connexion** (`req.session.regenerate`), détruite à la déconnexion, expirée après 30 minutes d'**inactivité** : `cookie.maxAge` de 30 minutes **et** `rolling: true`, qui repousse l'échéance à chaque requête (`maxAge` seul expirerait 30 minutes après la connexion).
- Le message d'erreur de connexion est le même pour un e-mail inconnu et un mauvais mot de passe, et **le temps de réponse aussi** : si l'e-mail est inconnu, le mot de passe est quand même vérifié contre un hachage Argon2id factice, calculé au démarrage.
- En-têtes de sécurité ajoutés par un petit middleware dans `main.ts`, sans dépendance : `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'none'` (interdit l'affichage dans un cadre) et `Referrer-Policy: same-origin`.
- `ValidationPipe` global avec `whitelist: true` et `forbidNonWhitelisted: true`. **Ne jamais passer le corps d'une requête directement à Prisma** : les champs modifiables sont listés explicitement, sinon un client pourrait envoyer `statut` ou `version`. Les arguments des outils de l'agent sont validés de la même façon.
- Justificatif : 2 Mo maximum, PDF, JPEG ou PNG, enregistré sous un nom généré (uuid), **jamais** sous le nom envoyé par le client. Jamais transmis au modèle IA. Le type est vérifié sur les **premiers octets du fichier** (`%PDF`, signature PNG ou JPEG), pas seulement sur le type annoncé par le navigateur. Le téléchargement passe par une route qui applique le filtre de périmètre, avec `Content-Disposition: attachment` et `X-Content-Type-Options: nosniff`. **Aucun fichier n'est jamais supprimé** : les révisions antérieures y font référence.
- Les messages de l'agent sont affichés **comme du texte**, jamais comme du HTML (`dangerouslySetInnerHTML` interdit) : la réponse du modèle peut être influencée par un message malveillant.
- Ne jamais journaliser une clé d'API, un mot de passe ou une conversation complète.
- Les routes `/api/demo/...`, dont `POST /api/demo/banque/mode`, n'existent que si `DEMO_MODE=true` (activé dans Docker Compose, à `false` par défaut dans les tests sauf ceux qui en ont besoin). Elles sont réservées aux conseillers et aux superviseurs.

## Volontairement non inclus

Ne pas ajouter sans demande explicite : worker de reprise automatique, tâche planifiée, table de clés d'idempotence HTTP, jeton de confirmation stocké, triggers, clés étrangères composites, monorepo ou package partagé, Swagger, limitation de débit, journaux structurés, bibliothèque de composants UI, Python. Les raisons sont dans `docs/stack-technique.md`.

## Tests

- Chaque règle de contenu (R1 à R5, R8 à R10) et chaque transition (dont R12 et R13) a un test unitaire dans le domaine, avec les bornes : 10 000 / 10 001, 30 000 / 30 001, 50 000 / 50 001, 100 000 / 100 001 DH ; durée 0 / 1 / 7 / 8 jours.
- Les garanties assurées par la base, R6 (index unique partiel), R7 et R11 (mise à jour conditionnelle) et R14 (filtre SQL), sont couvertes par des tests d'API.
- Chacun des 7 scénarios de recette du cahier a au moins un test d'API.
- Un brouillon de 60 000 DH sans justificatif renvoie l'avertissement R4 et il est quand même enregistré ; le mode simulé couvre ce cas (scénario 2).
- **Tests d'attaque contre l'agent**, des tests d'API lancés dans la CI avec le modèle piégé :
  - demande d'approbation ou de soumission directe ;
  - compte ou dossier d'un autre client ;
  - version inventée ;
  - champ `statut` ou `version` ajouté aux arguments d'un outil ;
  - outil inexistant ;
  - plus de 3 appels d'outils dans un même message.

  Chaque test vérifie trois choses : aucune modification des tables métier (seule `events` reçoit le refus), aucune donnée hors périmètre dans la réponse, et un refus tracé dans `events`.
- La concurrence est testée sur une vraie base PostgreSQL (deux requêtes lancées avec `Promise.all`). **Ne jamais remplacer la base par un mock dans les tests d'API.**
- Lancer les tests après chaque modification. **Ne jamais supprimer ou affaiblir un test pour le faire passer.**

## Façon de travailler

- Le développeur doit pouvoir **expliquer chaque ligne à l'oral**. Préférer le code simple et explicite ; pas d'abstraction prématurée.
- Pas de nouvelle dépendance sans le demander.
- Avancer par petites étapes. Proposer un plan avant tout changement sur plusieurs fichiers.
- Après chaque étape, résumer en français, en quelques phrases, ce qui a été fait et pourquoi.
- Ne pas modifier `docs/` sans le signaler explicitement.
- Travail directement sur `main`, par petits commits ; lancer les tests avant chaque push. La CI vérifie chaque push.
- Messages de commit en Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Pas de commit ni de push sans accord.
