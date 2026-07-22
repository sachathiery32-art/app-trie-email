# Passage à une vraie messagerie

La version personnelle pilote désormais une vraie boîte Gmail : lecture, envoi,
réponses, transferts, pièces jointes, dossiers et actions sur les libellés. Cette
feuille de route décrit ce qui reste nécessaire pour passer de cette connexion
directe à un SaaS multi-utilisateur synchronisé en permanence.

## 1. Choisir et autoriser un fournisseur

Pour Gmail, l'application devra utiliser OAuth 2.0 et les permissions les plus
limitées possibles :

- `gmail.send` suffit pour envoyer des messages ;
- `gmail.modify` permet de lire, rédiger, envoyer et modifier les messages ;
- la permission complète `https://mail.google.com/` ne doit être demandée que
  pour supprimer immédiatement et définitivement des messages.

Documentation : [permissions Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes)
et [envoi de messages](https://developers.google.com/workspace/gmail/api/guides/sending).

### Intervention du propriétaire nécessaire

- créer ou sélectionner un projet Google Cloud depuis un compte autorisé ;
- créer les identifiants OAuth et les placer dans Vercel ;
- renseigner le domaine, la marque, les contacts et les pages légales ;
- ajouter les comptes de test puis demander la publication de l'application.

Ces opérations sont liées à l'identité et aux comptes du propriétaire. Elles ne
peuvent pas être effectuées uniquement par le code du dépôt.

## 2. Ajouter l'authentification et la base de données

Une version multi-utilisateur nécessite :

- une authentification du compte SaaS ;
- PostgreSQL et Prisma ;
- des tables `User`, `MailboxConnection`, `Email`, `Thread`, `Label`, `Draft` et
  `SyncCursor` ;
- le chiffrement des jetons OAuth au repos ;
- l'isolation stricte des données de chaque utilisateur ;
- une politique de suppression et de conservation des données.

Le code peut être développé après le choix du fournisseur de base de données et
la création des secrets de chiffrement.

## 3. Implémenter le fournisseur Gmail

Le fournisseur remplacera progressivement les opérations fictives :

- récupérer les dossiers, libellés, messages et conversations ;
- envoyer des messages MIME ;
- créer et modifier des brouillons ;
- répondre et transférer en conservant les en-têtes de conversation ;
- appliquer les libellés, archiver et déplacer vers la corbeille ;
- renouveler automatiquement les jetons d'accès ;
- gérer les erreurs, quotas et autorisations révoquées.

Les actions sensibles devront être idempotentes pour éviter un double envoi
lorsqu'une requête est relancée.

## 4. Synchroniser sans rechargement manuel

Gmail peut prévenir le backend des changements via Google Cloud Pub/Sub. Une
notification fournit un `historyId`, puis le serveur récupère les changements
avec `history.list`. L'abonnement `watch` doit être renouvelé au moins tous les
sept jours ; Google recommande un renouvellement quotidien.

Documentation : [notifications push Gmail](https://developers.google.com/workspace/gmail/api/guides/push).

Il faudra également une tâche périodique de secours, car certaines notifications
peuvent être retardées ou perdues.

## 5. Sécuriser un SaaS public

Avant une ouverture au public :

- limitation du nombre de requêtes et protection contre les abus ;
- journal d'audit des envois et modifications ;
- confirmation explicite avant les actions irréversibles ;
- chiffrement des données et rotation des secrets ;
- sauvegardes, supervision et alertes ;
- tests automatisés et environnement de préproduction ;
- politique de confidentialité, conditions d'utilisation et procédure de
  suppression du compte.

Les permissions Gmail étendues sont classées comme restreintes. Une application
publique doit généralement passer la vérification Google ; si elle stocke ou
transmet ces données via ses serveurs, une évaluation de sécurité peut être
requise. Documentation : [vérification des permissions restreintes](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

## Ordre recommandé

1. Conserver la démonstration actuelle comme environnement de présentation.
2. Obtenir un projet Google autorisé et connecter un seul compte de test.
3. Ajouter PostgreSQL, Prisma et le chiffrement des jetons.
4. Remplacer une seule action fictive : la lecture de dix emails.
5. Tester, puis ajouter l'envoi d'un email vers une adresse contrôlée.
6. Ajouter brouillons, réponses, transferts et gestion des libellés. **Réponses,
   transferts et libellés terminés pour la version personnelle.**
7. Activer Pub/Sub et la synchronisation automatique.
8. Réaliser la sécurité, les pages légales et la vérification avant tout accès
   public.
