# Recréer Google OAuth personnel pour Email Organizer AI

Ce guide correspond au projet Google Cloud visible le 30 août 2026 et à une
utilisation réservée au propriétaire :

- nom : `PROJET EMAIL ORAGNIZER` ;
- ID : `projet-email-organizer` ;
- numéro : `676957248019`.

Remplacer `https://VOTRE-DOMAINE` par l'URL HTTPS réelle de l'application. Pour
une publication OAuth ouverte à tous, utiliser de préférence un domaine que
vous possédez et que vous pouvez valider dans Google Search Console.

Sans domaine, il est possible de terminer les étapes locales en mode **Test** :
laisser les URL de Branding et les domaines autorisés vides, puis créer le
client OAuth uniquement avec `http://localhost:3000` et son URI de callback.
Un domaine vérifiable ne devient indispensable qu'avant le passage public et
la soumission au Centre de vérification.

## 1. Activer les API

Depuis la page d'accueil Google Cloud affichée sur la capture :

1. vérifier en haut que **PROJET EMAIL ORAGNIZER** est sélectionné ;
2. cliquer sur le menu **☰** en haut à gauche ;
3. ouvrir **API et services** puis **Bibliothèque** ;
4. rechercher **Gmail API**, ouvrir le résultat et cliquer sur **Activer** ;
5. revenir à la bibliothèque, rechercher **People API** et cliquer sur
   **Activer** ;
6. revenir encore à la bibliothèque, rechercher **Cloud Pub/Sub API** et
   cliquer sur **Activer**.

## 2. Enregistrer l'application OAuth

1. ouvrir **☰ > Google Auth Platform > Branding** ;
2. si Google affiche **Premiers pas**, cliquer dessus ;
3. saisir **Email Organizer AI** comme nom de l'application ;
4. choisir une adresse réelle dans **Adresse e-mail d'assistance utilisateur** ;
5. cliquer sur **Suivant** ;
6. dans **Audience**, sélectionner **Externe** ;
7. cliquer sur **Suivant** ;
8. saisir l'adresse de contact du développeur ;
9. cliquer sur **Suivant**, accepter la politique Google API Services si elle
   est comprise et acceptée, puis cliquer sur **Continuer** et **Créer**.

Dans **Branding**, renseigner ensuite :

- page d'accueil : `https://VOTRE-DOMAINE` ;
- politique de confidentialité : `https://VOTRE-DOMAINE/privacy` ;
- conditions d'utilisation : `https://VOTRE-DOMAINE/terms` ;
- domaine autorisé : le domaine racine, sans `https://` et sans chemin ;
- logo : facultatif pendant les tests, recommandé avant vérification.

Les trois URL doivent être publiques, fonctionner sans connexion et utiliser le
même nom d'application. Le domaine devra être validé dans Google Search Console
avant la vérification de marque.

## 3. Déclarer exactement les accès demandés

1. ouvrir **Google Auth Platform > Accès aux données** ;
2. cliquer sur **Ajouter ou supprimer des niveaux d'accès** ;
3. sélectionner ou ajouter manuellement :
   - `openid` ;
   - `email` ;
   - `profile` ;
   - `https://www.googleapis.com/auth/gmail.modify` ;
   - `https://www.googleapis.com/auth/contacts.readonly` ;
4. cliquer sur **Mettre à jour**, puis **Enregistrer**.

`gmail.modify` est nécessaire pour lire, classer, rédiger et envoyer depuis la
boîte connectée. `contacts.readonly` sert uniquement aux suggestions de
destinataires. Le premier est un accès restreint Google et déclenche une
vérification renforcée avant l'ouverture publique complète.

## 4. Créer le client OAuth Web

1. ouvrir **Google Auth Platform > Clients** ;
2. cliquer sur **Créer un client** ;
3. choisir **Application Web** ;
4. nommer le client `Email Organizer AI Web` ;
5. dans **Origines JavaScript autorisées**, ajouter :
   - `http://localhost:3000` ;
   - `https://VOTRE-DOMAINE` ;
6. dans **URI de redirection autorisés**, ajouter exactement :
   - `http://localhost:3000/api/auth/callback/google` ;
   - `https://VOTRE-DOMAINE/api/auth/callback/google` ;
7. cliquer sur **Créer** ;
8. copier immédiatement l'**ID client** et le **code secret du client** dans un
   gestionnaire de mots de passe. Ne jamais les mettre dans Git ou une capture.

Google exige une correspondance exacte de l'URI : protocole, domaine, port,
chemin et éventuelle barre finale.

## 5. Configurer les secrets de l'application

Dans `.env.local`, conserver la clé xKiro et renseigner :

```env
XKIRO_API_KEY=VOTRE_CLE_XKIRO

AUTH_SECRET=SECRET_ALEATOIRE_1
AUTH_GOOGLE_ID=ID_CLIENT_COPIE_DEPUIS_GOOGLE
AUTH_GOOGLE_SECRET=SECRET_CLIENT_COPIE_DEPUIS_GOOGLE

LEGAL_NAME=VOTRE_NOM_OU_RAISON_SOCIALE
SUPPORT_EMAIL=VOTRE_ADRESSE_DE_SUPPORT

DATABASE_URL=VOTRE_URL_POSTGRESQL
POSTGRES_SSL=require
DATA_ENCRYPTION_SECRET=SECRET_ALEATOIRE_2
```

Générer `AUTH_SECRET` et `DATA_ENCRYPTION_SECRET` séparément avec Node.js :

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Lancer la commande deux fois et utiliser une valeur différente pour chaque
variable. Ajouter aussi l'unique adresse autorisée :

```env
ALLOWED_GOOGLE_EMAIL=votre_adresse_gmail
```

Ajouter les mêmes variables dans l'hébergeur, pour l'environnement de
production, puis redéployer.

## 6. Tester avant publication

1. ouvrir **Google Auth Platform > Audience** ;
2. laisser d'abord le statut **Test** ;
3. dans **Utilisateurs tests**, cliquer sur **Ajouter des utilisateurs** ;
4. ajouter uniquement votre propre adresse Gmail ;
5. enregistrer ;
6. redémarrer l'application avec `npm run dev` ;
7. ouvrir `http://localhost:3000`, se connecter avec le compte autorisé et tester
   la réception, l'analyse et un brouillon ;
8. vérifier qu'un autre compte Google est refusé par l'application.

En mode Test, seuls les utilisateurs ajoutés peuvent accepter les accès Gmail,
et les autorisations hors identité expirent après sept jours.

## 7. Recréer Gmail Pub/Sub

Cette partie exige que l'application soit déjà déployée en HTTPS et que
PostgreSQL soit configuré.

1. ouvrir **☰ > Pub/Sub > Sujets** ;
2. cliquer sur **Créer un sujet** ;
3. saisir `gmail-mailbox-events` comme ID, puis créer le sujet ;
4. ouvrir le sujet et son onglet **Autorisations** ;
5. cliquer sur **Accorder l'accès** ou **Ajouter un compte principal** ;
6. saisir `gmail-api-push@system.gserviceaccount.com` ;
7. choisir le rôle **Pub/Sub > Éditeur Pub/Sub**, puis enregistrer ;
8. ouvrir **Pub/Sub > Abonnements** et cliquer sur **Créer un abonnement** ;
9. nommer l'abonnement `gmail-mailbox-events-push` ;
10. sélectionner le sujet `gmail-mailbox-events` ;
11. choisir le type de distribution **Push** ;
12. saisir comme point de terminaison :
    `https://VOTRE-DOMAINE/api/gmail/pubsub?token=SECRET_PUBSUB` ;
13. créer l'abonnement.

Générer `SECRET_PUBSUB` avec la même commande Node.js que ci-dessus, puis
ajouter dans `.env.local` et dans l'hébergeur :

```env
GMAIL_PUBSUB_TOPIC=projects/projet-email-organizer/topics/gmail-mailbox-events
GMAIL_PUBSUB_VERIFICATION_TOKEN=SECRET_PUBSUB
```

Redéployer, se reconnecter, ouvrir **Réglages** dans Email Organizer AI et
activer la synchronisation permanente pour chaque compte de test.

## 8. Passer de deux testeurs à une application publique

Une audience **Externe** ne suffit pas à elle seule. Pour permettre réellement
la connexion de n'importe quel utilisateur sans rester limité aux testeurs :

1. déployer une version fonctionnelle sur le domaine public ;
2. vérifier ce domaine dans Google Search Console ;
3. vérifier que le Branding, les URL légales et les niveaux d'accès sont
   complets et correspondent exactement au code ;
4. ouvrir **Google Auth Platform > Audience** et passer l'application en
   production avec **Publier l'application** ;
5. ouvrir **Google Auth Platform > Centre de vérification** ;
6. cliquer sur **Préparer la vérification** ;
7. fournir les justifications des deux niveaux d'accès, une vidéo montrant la
   connexion et l'usage réel de Gmail, puis les informations demandées ;
8. cliquer une seule fois sur **Envoyer pour vérification** et surveiller
   l'adresse de contact du projet.

Textes de justification à adapter puis à fournir dans le Centre de vérification :

- `gmail.modify` : « Email Organizer AI affiche la boîte Gmail de l'utilisateur,
  lit le contenu des messages qu'il ouvre, applique les libellés et actions qu'il
  demande, enregistre des brouillons et envoie les messages qu'il valide. Des
  niveaux d'accès plus étroits ne permettent pas de réunir la lecture, le
  classement, la rédaction et l'envoi nécessaires au fonctionnement principal
  du client de messagerie. »
- `contacts.readonly` : « Email Organizer AI lit uniquement les noms et adresses
  des contacts Google afin de suggérer des destinataires pendant la rédaction.
  L'application ne crée, ne modifie et ne supprime aucun contact. »

La vidéo de démonstration doit montrer l'écran de consentement complet, chaque
niveau d'accès demandé, la boîte Gmail affichée, une action sur un libellé, la
création ou l'envoi d'un brouillon, une suggestion de contact et l'usage d'une
fonction IA. Ne jamais faire apparaître de clé ou de secret dans la vidéo.

Comme l'application lit du contenu Gmail avec `gmail.modify` et transmet des
extraits à un serveur pour les fonctions IA, Google classe cet accès comme
restreint. Une évaluation de sécurité peut être exigée avant une ouverture
publique vérifiée. Tant que cette vérification n'est pas terminée, Google peut
afficher un avertissement et applique un plafond à vie de 100 nouveaux
utilisateurs sur le projet.
