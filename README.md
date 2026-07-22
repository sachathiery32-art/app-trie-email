# Email Organizer AI

Pilote personnel de messagerie construit avec Next.js, Auth.js et Groq. La
connexion Google est réelle, limitée à une adresse autorisée et affiche les 20
messages les plus récents de la boîte de réception Gmail en lecture seule.

## Fonctionnalités

- connexion Google OAuth avec liste blanche côté serveur ;
- conservation chiffrée des jetons OAuth dans un cookie `HttpOnly` ;
- renouvellement automatique du jeton d'accès Google ;
- chargement réel des 20 derniers messages de la boîte de réception ;
- affichage du compte, des compteurs Gmail, des états lu/non lu et des favoris ;
- sélection d'un message et aperçu de ses métadonnées ;
- actualisation manuelle sans modifier la boîte Gmail ;
- interface responsive et accessible au clavier.

L'ancienne interface de démonstration et les routes Groq sont conservées dans le
code pour les prochaines étapes, mais l'accueil utilise désormais Gmail réel.

## Architecture

- `app/api/classify` valide puis classe un email de démonstration avec Groq ;
- `app/api/draft-reply` génère un brouillon de réponse à partir d'un email
  fictif ;
- `app/api/draft-message` génère un nouveau message à partir d'une consigne ;
- `app/api/auth/[...nextauth]` reçoit les requêtes OAuth et le callback Google ;
- `app/api/gmail/inbox` retourne la première page Gmail en lecture seule ;
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

Cette étape lit Gmail mais ne récupère encore qu'une page de 20 messages et un
aperçu fourni par Gmail. Elle ne modifie aucun message et ne permet pas encore
d'envoyer, répondre, transférer, classer ou synchroniser la boîte en arrière-plan.
Ces actions seront branchées une par une après validation de la lecture réelle.

Le plan technique et les interventions nécessaires sont détaillés dans
[`docs/PRODUCTION-ROADMAP.md`](docs/PRODUCTION-ROADMAP.md).
