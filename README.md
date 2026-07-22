# Email Organizer AI

Pilote personnel de messagerie construit avec Next.js, Auth.js et Groq. La
connexion Google est réelle et limitée à une adresse autorisée, mais les emails
affichés restent fictifs pour valider chaque étape séparément.

## Fonctionnalités

- boîte de réception, favoris, messages envoyés, brouillons, archives et
  corbeille ;
- recherche, filtres, catégories et tri des messages ;
- rédaction d'un nouveau message avec Cc et Cci ;
- génération de l'objet et du contenu d'un nouveau message avec Groq ;
- réponse et transfert avec préremplissage du message ;
- génération d'un brouillon de réponse avec Groq ;
- classification d'un email fictif avec Groq ;
- archivage, restauration, suppression, favoris et état lu/non lu ;
- sauvegarde automatique des changements dans le `localStorage` du navigateur ;
- connexion Google OAuth avec liste blanche côté serveur ;
- réinitialisation complète de la démonstration ;
- interface responsive et accessible au clavier.

Les envois sont simulés : le message apparaît dans le dossier **Envoyés**, mais
aucun email réel ne quitte l'application. Toutes les adresses utilisent le
domaine réservé `.example`.

## Architecture

- `app/api/classify` valide puis classe un email de démonstration avec Groq ;
- `app/api/draft-reply` génère un brouillon de réponse à partir d'un email
  fictif ;
- `app/api/draft-message` génère un nouveau message à partir d'une consigne ;
- `app/api/auth/[...nextauth]` reçoit les requêtes OAuth et le callback Google ;
- `auth.ts` centralise le fournisseur Google et la liste blanche ;
- `components/email-sorting-dashboard.tsx` orchestre l'interface de messagerie ;
- `components/email-composer.tsx` gère la rédaction, les brouillons et
  l'assistance IA ;
- `hooks/use-demo-mailbox.ts` charge et persiste la boîte fictive localement ;
- `lib/demo-emails.ts` contient le jeu de données de démonstration ;
- `lib/groq.ts` centralise l'unique client Groq côté serveur ;
- `lib/ai-rate-limit.ts` limite les appels IA par adresse réseau ;
- `types/email.ts` définit les contrats TypeScript partagés.

La classification et la réponse IA n'acceptent que les identifiants du jeu de
démonstration. La rédaction libre valide strictement les longueurs et toutes les
routes IA appliquent une limitation légère du nombre de requêtes. Une production
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

Cette étape valide uniquement l'identité Google. Elle ne peut pas encore lire ou
modifier la boîte Gmail, envoyer un vrai message ou recevoir de nouveaux emails.
Ces actions seront branchées une par une après le test de connexion.

Le plan technique et les interventions nécessaires sont détaillés dans
[`docs/PRODUCTION-ROADMAP.md`](docs/PRODUCTION-ROADMAP.md).
