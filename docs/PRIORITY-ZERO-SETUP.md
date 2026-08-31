# Activer les fonctions Priorité 0 en production

Le code fonctionne encore en mode Gmail direct sans base de données pour la
lecture, les actions courantes, les brouillons Gmail et l'envoi immédiat.
PostgreSQL et les services ci-dessous sont nécessaires pour l'annulation et la
programmation d'envoi, les rappels, les règles permanentes, Pub/Sub et les
notifications Web Push.

## 1. PostgreSQL et chiffrement

Créer une base PostgreSQL puis renseigner :

```env
DATABASE_URL=postgresql://utilisateur:mot_de_passe@hote:5432/email_organizer
POSTGRES_SSL=require
DATA_ENCRYPTION_SECRET=une_valeur_aleatoire_d_au_moins_32_caracteres
```

Le schéma est créé automatiquement au premier appel serveur. Il conserve les
préférences, signatures, modèles, règles, jetons OAuth chiffrés, curseurs Gmail,
envois programmés, rappels et abonnements Web Push. Les messages complets ne
sont pas copiés en base.

Après ce déploiement, reconnecter le compte Google afin que le jeton de
renouvellement soit enregistré chiffré dans PostgreSQL.

## 2. Google OAuth, Gmail et Contacts

Dans le projet Google Cloud utilisé par Auth.js :

1. activer **Gmail API** et **People API** ;
2. conserver l'URI de rappel de production dans le client OAuth ;
3. conserver une audience **Externe** avec l'adresse personnelle ajoutée comme
   utilisateur test ;
4. vérifier que `ALLOWED_GOOGLE_EMAIL` contient exactement cette adresse ;
5. reconnecter ce compte Gmail pour accepter les permissions Gmail et Contacts.

Les contacts servent uniquement aux suggestions de destinataires. L'application
n'écrit pas dans le carnet d'adresses.

## 3. Gmail Pub/Sub

1. créer un topic, par exemple `gmail-mailbox-events` ;
2. autoriser le compte de service
   `gmail-api-push@system.gserviceaccount.com` à publier sur ce topic ;
3. créer un abonnement **Push** vers
   `https://votre-domaine/api/gmail/pubsub?token=VOTRE_JETON` ;
4. renseigner les variables suivantes :

```env
GMAIL_PUBSUB_TOPIC=projects/votre-projet/topics/gmail-mailbox-events
GMAIL_PUBSUB_VERIFICATION_TOKEN=un_jeton_long_et_aleatoire
```

Depuis l'interface, ouvrir **Réglages**, puis activer la synchronisation. Le
serveur crée un `watch` pour la boîte autorisée et mémorise son `historyId`. Le
webhook refuse toute autre adresse. Chaque notification Pub/Sub récupère ensuite
les changements, exécute les règles et signale les nouveaux messages importants.
Le `watch` est renouvelé par la tâche périodique.

## 4. Notifications Web Push

Générer une paire VAPID :

```bash
npx web-push generate-vapid-keys
```

Puis renseigner :

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=cle_publique
VAPID_PRIVATE_KEY=cle_privee
VAPID_SUBJECT=mailto:admin@votre-domaine.fr
```

L'utilisateur peut ensuite autoriser les notifications depuis **Réglages**.
Elles sont envoyées uniquement pour les nouveaux messages portant le marqueur
Gmail `IMPORTANT`. Une copie consultable reste dans le centre de notifications.

## 5. Tâche périodique

Définir un secret puis appeler toutes les cinq minutes :

```env
CRON_SECRET=un_autre_secret_long_et_aleatoire
```

```bash
curl --fail \
  --header "Authorization: Bearer $CRON_SECRET" \
  https://votre-domaine/api/cron/priority-zero
```

Le dépôt contient aussi le workflow GitHub Actions
`.github/workflows/priority-zero-cron.yml`. Ajouter dans les secrets GitHub :

- `EMAIL_ORGANIZER_URL`, sans barre oblique finale ;
- `CRON_SECRET`, identique à la variable de production.

La tâche envoie les brouillons arrivés à échéance, déclenche les rappels et
renouvelle les abonnements Gmail. L'annulation d'envoi utilise le même mécanisme :
avec une exécution toutes les cinq minutes, un délai d'annulation court est
traité immédiatement tant que l'application est ouverte, puis repris par la
tâche serveur au passage suivant.

## 6. Vérification

Après déploiement :

1. ouvrir les réglages et vérifier l'indicateur **PostgreSQL connecté** ;
2. enregistrer une signature, un modèle et une règle, puis recharger la page ;
3. créer un brouillon, fermer le composeur et le retrouver dans Gmail ;
4. programmer un envoi vers une adresse de test, l'annuler, puis en programmer un second ;
5. créer un rappel et vérifier sa notification ;
6. envoyer un message marqué important au compte connecté et contrôler le centre de notifications ;
7. vérifier les journaux de `/api/gmail/pubsub` et `/api/cron/priority-zero`.

Ne jamais exposer `AUTH_GOOGLE_SECRET`, `DATA_ENCRYPTION_SECRET`,
`VAPID_PRIVATE_KEY`, `GMAIL_PUBSUB_VERIFICATION_TOKEN` ou `CRON_SECRET` dans du
code client, des captures ou des journaux.
