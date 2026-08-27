# Email Organizer AI

Client de messagerie professionnel construit avec Next.js, Auth.js, Gmail,
PostgreSQL et Groq. L'interface reprend les repères essentiels de Gmail tout en
ajoutant dossiers personnalisés, tri automatique, assistance IA et outils de
suivi pour un usage d'entrepreneur.

## Fonctionnalités

- connexion Google OAuth limitée à l'adresse autorisée côté serveur ;
- navigation Gmail dense : réception, favoris, envoyés, brouillons, archives,
  corbeille, tous les messages, dossiers et sous-dossiers personnalisés ;
- recherche Gmail, lecture des fils, pièces jointes, réponses et transferts ;
- brouillons Gmail réels, sauvegardés automatiquement et avant la fermeture ;
- annulation d'envoi configurable et programmation d'un message ;
- snooze, rappels, sélection multiple, tout sélectionner et actions groupées ;
- suggestions Google Contacts, signatures et modèles réutilisables ;
- préférences et règles de classement enregistrées dans PostgreSQL ;
- synchronisation permanente par Gmail Pub/Sub avec reprise par `historyId` ;
- notifications navigateur et centre de notifications pour les nouveaux
  messages Gmail réellement importants ;
- renouvellement automatique du `watch` Gmail et traitement périodique des
  envois et rappels ;
- rédaction, reformulation, analyse, recherche en langage naturel et classement
  automatique avec Groq ;
- interface responsive, accessible au clavier et pensée pour afficher beaucoup
  de messages sans perdre les commandes principales.

## Démarrage local

Prérequis : Node.js 20 ou plus récent et un client OAuth Google autorisé.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Renseigner au minimum :

```env
GROQ_API_KEY=votre_cle_groq
AUTH_SECRET=une_valeur_aleatoire_longue
AUTH_GOOGLE_ID=id_client_google
AUTH_GOOGLE_SECRET=secret_client_google
ALLOWED_GOOGLE_EMAIL=adresse_autorisee
```

Ouvrir [http://localhost:3000](http://localhost:3000). Sans PostgreSQL, la
lecture, les brouillons Gmail et l'envoi immédiat restent disponibles ; les
fonctions persistantes indiquent clairement que la base doit être configurée.

## Configuration de production

Copier toutes les variables de `.env.example` dans l'hébergeur, puis suivre
[`docs/PRIORITY-ZERO-SETUP.md`](docs/PRIORITY-ZERO-SETUP.md) pour configurer :

- PostgreSQL et le chiffrement du jeton Google ;
- People API pour les contacts suggérés ;
- Gmail Pub/Sub et le renouvellement du `watch` ;
- les clés VAPID pour les notifications Web Push ;
- la tâche périodique protégée par `CRON_SECRET`.

Un workflow GitHub Actions optionnel appelle la tâche de fond toutes les cinq
minutes lorsque les secrets `EMAIL_ORGANIZER_URL` et `CRON_SECRET` sont présents.

## Architecture principale

- `components/gmail-inbox.tsx` : boîte Gmail, navigation, sélection groupée,
  rappels, notifications et orchestration de l'interface ;
- `components/email-composer.tsx` : brouillons distants, contacts, modèles,
  pièces jointes, confirmation et programmation ;
- `components/mail-settings-panel.tsx` : préférences, signatures, modèles,
  règles, Pub/Sub et notifications ;
- `lib/gmail.ts` : appels Gmail, brouillons, lots, `watch` et historique ;
- `lib/mail-store.ts` et `lib/database.ts` : persistance PostgreSQL ;
- `lib/background-sync.ts` : règles automatiques, notifications, rappels,
  envois programmés et renouvellement Gmail ;
- `lib/secret-crypto.ts` : chiffrement AES-GCM des jetons OAuth au repos ;
- `app/api/gmail/pubsub` : réception protégée des événements Google ;
- `app/api/cron/priority-zero` : exécution authentifiée des tâches périodiques.

Les messages complets restent chez Gmail. PostgreSQL ne conserve que les
paramètres nécessaires au fonctionnement permanent, les curseurs de
synchronisation et les tâches différées.

## Qualité et sécurité

```bash
npm run lint
npm run build
npm audit --omit=dev
```

Les routes Gmail exigent une session Google autorisée. Les secrets restent côté
serveur, les sorties IA structurées sont validées et tout texte provenant d'un
email ou d'une pièce jointe est traité comme une donnée non fiable.

## Limites connues

- la limite actuelle des pièces jointes est de 3 Mo par requête ;
- l'analyse des PDF scannés ne fait pas d'OCR ;
- l'ouverture au public exige encore la vérification OAuth Google, les pages
  légales, une politique de conservation et un audit de sécurité externe ;
- Gmail reste le fournisseur de transport : l'application est un client de
  messagerie avancé, pas encore un serveur SMTP/IMAP indépendant.

La trajectoire vers une messagerie multi-utilisateur est détaillée dans
[`docs/PRODUCTION-ROADMAP.md`](docs/PRODUCTION-ROADMAP.md).
