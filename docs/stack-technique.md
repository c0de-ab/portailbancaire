# Stack technique

Le projet repose sur une stack **simple, cohérente et entièrement en TypeScript**. Le cahier des charges demande de « justifier ses choix plutôt que de multiplier les composants » : chaque outil retenu répond à une exigence précise, et les outils écartés sont listés à la fin, avec la raison de leur absence.

| Couche | Technologie | Rôle et justification |
|---|---|---|
| **Langage** | TypeScript (mode `strict`) | Typage strict sur tout le projet ; un statut mal orthographié est détecté à la compilation. |
| **Runtime** | Node.js 24 LTS | Version LTS, figée dans `.nvmrc` et dans l'image Docker. |
| **Organisation** | Deux dossiers : `api/` et `web/` | Pas de monorepo ni de package partagé : les quelques types utiles au frontend (statuts, libellés) sont recopiés dans `web/src/types.ts`. |
| **Frontend** | React + Vite | Écrans client (avec le chat), conseiller et superviseur. |
| | React Router | Pages par rôle. |
| | `fetch` + module `api.ts` | Appels à l'API. En cas de conflit de version (HTTP 409), le dossier est rechargé et l'utilisateur est prévenu. |
| | CSS simple | Interface sobre et lisible, sans bibliothèque de composants. |
| **Backend** | NestJS | Modules, controllers, services et guards ; structure proche de Spring Boot. |
| | API REST | Toutes les routes sous le préfixe `/api` (`setGlobalPrefix('api')`). Une route par action métier : `POST /api/demandes/:id/soumettre`, `/approuver`, `/rejeter`, `/recommander`, `/annuler`… |
| | Erreurs | Format unique `{ erreurs: [{ code, champ, message }] }`, avec le code de la règle ; `champ` est facultatif (une erreur de version ne porte sur aucun champ). La soumission renvoie toutes les erreurs à la fois. 422 contenu invalide (R1 à R5, R10) ; 409 conflit d'état ou de version (R6, R7, R11, R12, R13, transition impossible) ; 403 l'acteur n'a pas le droit (R8, R9, rôle refusé par le guard) ; 404 dossier hors périmètre (R14). |
| | `class-validator` + `ValidationPipe` | Validation de toutes les entrées, avec l'outil standard de NestJS. |
| **Domaine** | Fonctions TypeScript pures | Règles R1 à R14, seuils et table des transitions, sans dépendance à NestJS ni à Prisma : faciles à tester. Chaque règle a un code, renvoyé dans les erreurs de l'API et utilisé par l'agent pour expliquer un refus. |
| **Données** | PostgreSQL 16 | Base persistante. |
| | Prisma 7 (7.4 ou plus) | Accès aux données, migrations et jeu de démonstration. Deux index uniques partiels, déclarés avec la fonctionnalité en preview `partialIndexes` ; repli prévu : migration SQL écrite à la main (`prisma migrate dev --create-only`). |
| **Sécurité** | Sessions serveur (`express-session` + `connect-pg-simple`) | Exigé par le cahier : « Les identités et autorisations viennent de la session serveur. » Cookie `httpOnly`, `SameSite=Strict`, `Secure` en production. |
| | Même origine | L'API sert le frontend construit ; en développement, Vite redirige `/api` vers le backend. Avec `SameSite=Strict`, un site tiers ne peut pas envoyer de requête accompagnée de la session : c'est la protection contre le CSRF. |
| | Guards NestJS + filtre de périmètre | Un guard vérifie les rôles ; le périmètre (ses comptes, son portefeuille, son équipe) est ajouté dans chaque requête SQL. Un dossier hors périmètre renvoie 404. Les outils de l'agent passent par les mêmes services. |
| | Argon2id (`argon2`) | Hachage des mots de passe. |
| | Upload via Multer | Justificatif fictif : 2 Mo maximum, PDF, JPEG ou PNG. Il est enregistré hors du dossier public sous un nom généré par le serveur (uuid), jamais sous le nom envoyé par le client ; le nom d'origine n'est gardé que pour l'affichage. Seule sa présence est contrôlée, et il n'est jamais transmis au modèle IA. Aucun fichier n'est jamais supprimé, car les révisions antérieures y font référence. |
| **Intelligence artificielle** | SDK Anthropic (`@anthropic-ai/sdk`) | Appel d'outils natif ; modèle choisi par variable d'environnement ; clé uniquement côté serveur. |
| | Interface `LlmClient` | Deux implémentations dans l'application : connectée, et simulée déterministe (`LLM_MODE=mock`, mode par défaut partout : Docker, développement et tests). L'évaluateur peut tout lancer sans clé. Le mode simulé répond par correspondance de motifs et couvre au minimum le parcours normal, le brouillon de 60 000 DH sans justificatif (avertissement R4, scénario 2), la demande de contournement et l'accès à un autre compte (scénario 7). Une troisième implémentation, le **modèle piégé**, est réservée aux tests (voir « Initiatives »). |
| | Quatre outils côté serveur | `consulter_comptes` (plafond réellement appliqué par la banque, H21, et demande en cours éventuelle du compte avec son état, pour prévenir de R6), `consulter_dossier` (état, motifs visibles par le client, historique ; H19), `preparer_brouillon` (crée ou met à jour le brouillon du compte, ou le dossier en complément ; H20 ; renvoie les avertissements de `verifierRegles` avec leur code, affichés comme des données du système ; H23) et `proposer_soumission` (affiche une carte de confirmation). Les règles fictives sont fournies dans le contexte du modèle. Aucun outil ne permet d'approuver, d'activer, de soumettre seul ou de modifier des droits. |
| | Carte de confirmation | Elle affiche le montant, la durée et le motif lus en base, et transmet la version sans l'afficher (H14). Le clic du client appelle la même route que le formulaire, avec ces valeurs : si l'une d'elles a changé, la confirmation est refusée et doit être renouvelée. |
| | Garde-fous | Délai de 15 s par appel au modèle, 3 appels d'outils au maximum par message, 1 024 tokens de réponse au maximum. Si le modèle est indisponible, le chat l'indique et les formulaires restent utilisables. |
| **Banque simulée** | Module NestJS + 2 tables | Activation et désactivation avec une clé d'idempotence fixe par dossier (`act-<id>`, `desact-<id>`). Mode `SUCCES`, `ECHEC` ou `REPONSE_PERDUE`, choisi par variable d'environnement ou par la route `POST /api/demo/banque/mode`, qui n'existe que si `DEMO_MODE=true` ; les routes `/api/demo/...` sont réservées aux conseillers et aux superviseurs. Les modes `ECHEC` et `REPONSE_PERDUE` ne s'appliquent qu'aux nouvelles clés (H16). Appel synchrone, délai de 3 s ; la réponse HTTP indique le résultat. |
| | Bouton « Relancer » | Reprise d'une activation échouée, restée sans réponse ou interrompue (En attente), avec la même clé : jamais de double activation. Action utilisateur filtrée par le périmètre et tracée, conditionnée au seul statut Approuvée (H15). |
| | Commande `npm run expire -- --date <date>` | Expiration par une commande de démonstration reproductible, mécanisme explicitement autorisé par le cahier. Elle traite les plafonds dont l'échéance est passée à la date indiquée, et reprend les désactivations échouées. Elle exécute uniquement le code compilé (`node dist/...`) sans jamais le compiler elle-même, pour fonctionner à l'identique dans le conteneur ; en local, on lance `npm run build` avant. Une date antérieure à l'heure réelle est refusée, et les événements sont datés de l'heure réelle (H22). |
| **Traçabilité** | Table `events` | Acteur, action, date, référence, version et motif ; appels d'outils et refus sensibles ; ni secrets, ni conversations complètes. |
| | Logger NestJS | Journaux techniques. |
| **Tests** | Jest + Supertest (fournis par NestJS) | Tests unitaires des règles et des transitions ; tests d'API sur une base PostgreSQL de test lancée par Docker Compose, y compris la concurrence. La base de test est créée au premier lancement du conteneur `db` par un script d'initialisation (`docker-entrypoint-initdb.d`). |
| | Procédure de recette | Les 7 scénarios du cahier, décrits pas à pas dans le README. |
| **Qualité** | ESLint + Prettier | Code homogène et lisible. |
| | Conventional Commits, petits commits directement sur `main` | Historique Git lisible ; les tests sont lancés avant chaque push, et la CI vérifie chaque push pour que `main` reste toujours fonctionnelle. |
| **Livraison** | Docker Compose | `docker compose up` lance la base et l'application, avec les comptes de démonstration, l'IA en mode simulé et le mode démonstration activé (`DEMO_MODE=true`). |
| | GitHub Actions (CI) | Mise en place dès le premier jour : lint, vérification des types et tests à chaque push sur `main`. Détail dans la section « Intégration continue » de CLAUDE.md. |
| | `.env.example` | Configuration documentée, sans aucun secret. |
| **Documentation** | README + Mermaid | Lancement, hypothèses, périmètre réalisé, limites connues, temps consacré ; fournisseur IA (données transmises, délais, erreurs, limites de coût) ; diagrammes d'états et d'architecture ; section « Arbitrages ». |

## Pourquoi NestJS

NestJS impose une structure proche de Spring Boot (modules, controllers, services, injection de dépendances), ce qui rend le code prévisible. L'injection de dépendances permet de remplacer le modèle IA et la banque par des versions de test, et les guards centralisent le contrôle des rôles. Les règles métier restent dans des fonctions pures, indépendantes du framework.

## Ce qui garantit la fiabilité

- **Un seul chemin vers les règles :** les routes REST, les outils de l'agent et la commande d'expiration passent tous par les mêmes services. L'agent n'a donc aucun pouvoir de plus qu'un formulaire.
- **La base garantit ce que le code seul ne peut pas garantir en cas d'accès simultanés :** une seule demande en cours par compte, un seul brouillon, une version vérifiée à chaque action, une seule décision par version et une seule opération bancaire par clé.
- **Le fournisseur IA est remplaçable :** il suffit d'une nouvelle implémentation de `LlmClient`.

## Volontairement non inclus

| Élément | Pourquoi il n'est pas nécessaire ici |
|---|---|
| Worker de reprise automatique | Le cahier exige qu'une reprise soit *possible* sans double activation : le bouton « Relancer » et la clé fixe y répondent. |
| Tâche planifiée | Le cahier autorise une commande de démonstration reproductible, plus simple à montrer. |
| Table de clés d'idempotence HTTP | Le double clic est déjà couvert : la version pour la soumission et les décisions, l'index unique pour les demandes, la clé fixe pour la banque. |
| Monorepo et package partagé | Les types communs au frontend et au backend sont peu nombreux. |
| Swagger, limitation de débit, journaux structurés | Utiles en production, sans effet sur les scénarios. Le coût de l'IA est maîtrisé par les garde-fous de l'agent. |
| Python | Tout le projet est en TypeScript, et le SDK d'IA existe nativement dans ce langage. |

## Initiatives

Deux choix qui vont au-delà du minimum demandé, parce qu'ils améliorent le parcours ou sa fiabilité. Cette section servira au README.

- **Un agent proactif, mais jamais autonome (H23).** Dans le domaine, `verifierRegles` renvoie la liste complète des erreurs. Les mêmes règles produisent des refus à la soumission et des avertissements sur le brouillon. L'agent prévient dès le début d'un dossier incomplet (R5) ou d'une demande déjà en cours (R6), puis suit les avertissements pour demander ce qui manque. Il propose des options, mais ne modifie le brouillon qu'après une réponse explicite du client. La carte de confirmation (R7) reste la garantie finale.
- **Des tests d'attaque contre l'agent.** Un modèle piégé, troisième implémentation de `LlmClient` réservée aux tests, obéit à l'attaquant. Des tests d'API lancés dans la CI l'utilisent pour tenter : une approbation ou une soumission directe, l'accès au compte ou au dossier d'un autre client, une version inventée, un champ `statut` ou `version` ajouté aux arguments, un outil inexistant, et plus de 3 appels d'outils dans un message. Chaque test vérifie qu'aucune table métier n'est modifiée, qu'aucune donnée hors périmètre n'est renvoyée et que le refus est tracé dans `events`. Ces tests montrent que la sécurité repose sur le serveur, et non sur la bonne conduite du modèle. Facultatif : `npm run eval:agent` rejoue les mêmes messages contre le vrai modèle et produit un rapport. Il n'est jamais lancé dans la CI, car il demande une clé, coûte de l'argent et n'est pas déterministe.

## Limites connues

Cette section servira au README. Le détail figure dans `docs/etats-transitions.md`, § 8.

- **Activation qui échoue toujours :** la demande reste Approuvée sans autre issue. Le compte reste bloqué par R6, et le client ne peut plus annuler (R12). La résolution se fait hors de l'application ; aucune transition n'est prévue pour ce cas.
- **Réaffectation d'un dossier :** le conseiller et l'équipe sont fixés à la première soumission ; une réaffectation explicite n'est pas couverte (H9).
- **Numérotation des références :** une séquence PostgreSQL n'est pas annulée avec la transaction. Une soumission refusée peut donc laisser un trou dans la numérotation ; l'unicité n'est pas affectée (H13).
