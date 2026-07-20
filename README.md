# Email Organizer AI

Prototype SaaS Next.js qui prépare l'organisation d'une boîte Gmail avec Groq.

## Fonctionnalités actuelles

- tableau de bord responsive avec emails fictifs ;
- recherche, catégories et tri manuel ;
- classification d'un email avec Groq ;
- connexion sécurisée avec Google OAuth via Auth.js ;
- session utilisateur de 30 jours ;
- protection des routes qui appellent Groq.

La récupération des vrais emails et la synchronisation en arrière-plan ne sont
pas encore actives. Elles nécessiteront PostgreSQL, Prisma et le stockage chiffré
des refresh tokens Google.

## Variables d'environnement

Copier `.env.example` vers `.env.local`, puis renseigner :

```env
GROQ_API_KEY=
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

Ne jamais ajouter `.env.local` à Git.

## Configuration OAuth Google

Activer Gmail API dans Google Cloud, puis créer un client OAuth de type
**Application Web**.

URI de redirection locale :

```text
http://localhost:3000/api/auth/callback/google
```

URI de redirection Vercel :

```text
https://VOTRE-DOMAINE-VERCEL/api/auth/callback/google
```

Le projet demande le scope `gmail.modify` pour pouvoir, à terme, lire les emails
et appliquer des libellés Gmail. En mode Testing, le compte utilisé doit être
ajouté aux utilisateurs de test dans Google Auth Platform.

## Développement

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Routes principales

- `GET /api/auth/*` : flux OAuth géré par Auth.js ;
- `GET /api/test` : vérifie Groq pour un utilisateur connecté ;
- `POST /api/classify` : classe un email fictif pour un utilisateur connecté.
