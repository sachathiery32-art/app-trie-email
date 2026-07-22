# Email Organizer AI

Pilote personnel de messagerie construit avec Next.js, Auth.js et Groq. La
connexion Google est réelle, limitée à une adresse autorisée et permet de piloter
la boîte Gmail depuis une interface secondaire.

## Fonctionnalités

- connexion Google OAuth avec liste blanche côté serveur ;
- conservation chiffrée des jetons OAuth dans un cookie `HttpOnly` ;
- renouvellement automatique du jeton d'accès Google ;
- pagination des dossiers Réception, Favoris, Envoyés, Brouillons, Archives,
  Corbeille et Tous les messages ;
- recherche utilisant la syntaxe Gmail ;
- lecture du contenu complet et téléchargement des pièces jointes jusqu'à 3 Mo ;
- nouveau message, réponse, réponse à tous et transfert rattaché au fil Gmail ;
- ajout de dix pièces jointes maximum, pour 3 Mo au total ;
- modification lu/non lu, favoris, archivage, corbeille, restauration et libellés ;
- rédaction Groq d'un nouveau message ou d'une réponse réelle ;
- synchronisation toutes les 60 secondes lorsque le site est ouvert, au retour
  sur l'onglet et à chaque nouvelle visite ;
- interface responsive et accessible au clavier.

L'ancienne interface de démonstration et les routes Groq sont conservées dans le
code pour les prochaines étapes, mais l'accueil utilise désormais Gmail réel.

## Architecture

- `app/api/classify` valide puis classe un email de démonstration avec Groq ;
- `app/api/draft-reply` génère un brouillon de réponse à partir d'un email Gmail
  autorisé ou fictif ;
- `app/api/draft-message` génère un nouveau message à partir d'une consigne ;
- `app/api/auth/[...nextauth]` reçoit les requêtes OAuth et le callback Google ;
- `app/api/gmail/inbox` retourne une page d'une vue Gmail et ses libellés ;
- `app/api/gmail/send` valide les destinataires, les fils et les pièces jointes ;
- `app/api/gmail/messages/[messageId]/modify` applique les actions Gmail ;
- `app/api/gmail/messages/[messageId]/attachments/[attachmentId]` transmet une
  pièce jointe sans exposer le jeton Google ;
- `auth.ts` centralise le fournisseur Google, la liste blanche et les jetons ;
- `components/gmail-inbox.tsx` affiche la boîte Gmail réelle ;
- `lib/google-oauth.ts` renouvelle le jeton d'accès sans exposer les secrets ;
- `lib/google-session.ts` déchiffre et contrôle la session côté serveur ;
- `lib/gmail.ts` centralise les appels et la normalisation Gmail ;
- `components/email-sorting-dashboard.tsx` conserve l'interface de démonstration ;
- `components/email-composer.tsx` gère la rédaction, les brouillons et
  l'assistance IA ;
- `hooks/use-demo-mailbox.ts` charge et persiste la boîte fictive localement ;
- `lib/demo-emails.ts` contient le jeu de données de démonstration ;
- `lib/groq.ts` centralise l'unique client Groq côté serveur ;
- `lib/ai-rate-limit.ts` limite les appels IA par adresse réseau ;
- `types/email.ts` définit les contrats TypeScript partagés.

La classification IA reste limitée au jeu de démonstration. La réponse IA accepte
un message Gmail réel après validation de la session. Toutes les routes IA
appliquent une limitation légère du nombre de requêtes. Une production
multi-instance devra remplacer cette limite locale par un stockage partagé.

## Installation

Copier `.env.example` vers `.env.local`, puis renseigner :

```env
GROQ_API_KEY=votre_cle_groq
AUTH_SECRET=une_valeur_aleatoire_longue
AUTH_GOOGLE_ID=id_client_google
AUTH_GOOGLE_SECRET=secret_client_google
ALLOWED_GOOGLE_EMAIL=adresse_autorisee
```

Puis lancer :

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Déploiement Vercel

Ajouter les cinq variables précédentes dans les variables d'environnement
Vercel. Elles restent sur le serveur et ne sont jamais incluses dans le
JavaScript envoyé au navigateur.

## Limites de cette version

La version personnelle interroge toujours Gmail directement et ne conserve pas
les emails dans une base de données. La synchronisation automatique fonctionne
donc lorsque le site est ouvert ; à la prochaine visite, la boîte est rechargée
depuis Gmail. Une synchronisation serveur permanente, même site fermé, exigera
PostgreSQL, Google Cloud Pub/Sub et une tâche de renouvellement de `watch`.

La limite de 3 Mo par requête/téléchargement vient de l'hébergement Vercel actuel,
pas de Gmail. Les brouillons Gmail côté serveur, les conversations regroupées et
la synchronisation Pub/Sub restent à développer pour une version SaaS publique.

Le plan technique et les interventions nécessaires sont détaillés dans
[`docs/PRODUCTION-ROADMAP.md`](docs/PRODUCTION-ROADMAP.md).
