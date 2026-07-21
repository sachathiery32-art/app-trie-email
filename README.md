# Email Organizer AI

Version personnelle de démonstration d'un organisateur d'emails avec Groq.

## Fonctionnalités actuelles

- tableau de bord responsive avec emails fictifs ;
- recherche, filtres, catégories et tri manuel ;
- classification d'un email avec Groq ;
- réinitialisation instantanée des données de démonstration ;
- aucune connexion Google et aucun accès à une boîte Gmail réelle.

Toutes les adresses utilisent le domaine réservé `.example`. Les modifications
effectuées dans l'interface restent dans le navigateur et sont perdues au
rechargement de la page.

## Variables d'environnement

Copier `.env.example` vers `.env.local`, puis renseigner :

```env
GROQ_API_KEY=
```

Ne jamais ajouter `.env.local` à Git.

## Développement

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Routes principales

- `GET /api/test` : vérifie la connexion du serveur à Groq ;
- `POST /api/classify` : classe un email fictif avec Groq.

La clé Groq reste exclusivement sur le serveur. Elle n'est jamais envoyée au
navigateur.
