# Feuille de route vers une messagerie indépendante

Email Organizer AI est aujourd'hui un client Gmail professionnel complet. La
Priorité 0 est implémentée dans le code : brouillons Gmail réels, envoi annulable
ou programmé, snooze et rappels, actions groupées, contacts, signatures,
modèles, persistance PostgreSQL, Gmail Pub/Sub, notifications importantes et
règles enregistrées côté serveur.

L'activation en production dépend encore des ressources du propriétaire
(PostgreSQL, Google Cloud, secrets VAPID et tâche périodique). La procédure est
détaillée dans [`PRIORITY-ZERO-SETUP.md`](PRIORITY-ZERO-SETUP.md).

## Étape suivante : comptes et isolation SaaS

- remplacer la liste blanche unique par des comptes applicatifs ;
- isoler toutes les données par utilisateur et organisation ;
- ajouter révocation, export et suppression complète d'un compte ;
- mettre en place journal d'audit, limitation distribuée et supervision ;
- ajouter des tests d'intégration Gmail/PostgreSQL et un environnement de
  préproduction.

## Devenir indépendant de Gmail

Une vraie boîte mail indépendante exige plus qu'une interface :

1. domaines et boîtes administrés par l'application ;
2. réception SMTP avec protections SPF, DKIM et DMARC ;
3. stockage durable des messages, fils, pièces jointes et index de recherche ;
4. émission SMTP avec gestion de réputation, files d'attente et rebonds ;
5. antivirus, antispam, quotas, sauvegardes et reprise après incident ;
6. connecteurs IMAP/OAuth pour importer et synchroniser Gmail ou Outlook.

Le chemin le plus sûr est progressif : conserver Gmail comme transport, rendre
le produit multi-utilisateur, ajouter l'import IMAP, puis seulement exploiter
une infrastructure SMTP propre ou un fournisseur transactionnel spécialisé.

## Conditions avant ouverture publique

- vérification OAuth Google des permissions sensibles ou restreintes ;
- politique de confidentialité, conditions d'utilisation et suppression de
  compte ;
- rotation des secrets, sauvegardes chiffrées et procédure d'incident ;
- audit de sécurité externe et contrôle des dépendances ;
- métriques sur les quotas Gmail, Pub/Sub, les tâches différées et les échecs
  d'envoi.

Les messages complets restent actuellement chez Gmail. La base applicative ne
conserve que la configuration, les curseurs de synchronisation et les tâches
nécessaires aux fonctions permanentes.
