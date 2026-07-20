import type { OrganizerEmail } from "@/types/email";

/**
 * Jeu de données purement fictif utilisé tant que Gmail n'est pas connecté.
 * Les domaines `.example` garantissent qu'aucune adresse réelle n'est affichée.
 */
export const DEMO_EMAILS: OrganizerEmail[] = [
  {
    id: "demo-1",
    senderName: "Sophie Martin",
    sender: "sophie.martin@northstar.example",
    subject: "Validation du lancement de septembre",
    preview:
      "Peux-tu confirmer les derniers éléments avant notre point de cet après-midi ?",
    body: "Bonjour Sacha,\n\nPeux-tu confirmer les derniers éléments avant notre point de cet après-midi ? Le calendrier de lancement est prêt et l'équipe attend seulement ta validation sur les trois priorités.\n\nMerci,\nSophie",
    receivedAt: "09:42",
    category: "professional",
    isRead: false,
    isStarred: true,
  },
  {
    id: "demo-2",
    senderName: "GitHub",
    sender: "notifications@github.example",
    subject: "Nouvelle activité sur votre dépôt",
    preview:
      "Un nouveau déploiement a été associé à la branche principale de votre projet.",
    body: "Une nouvelle activité a été détectée sur le dépôt app-trie-email. Le déploiement associé à la branche principale est maintenant disponible.",
    receivedAt: "09:18",
    category: "notification",
    isRead: false,
    isStarred: false,
  },
  {
    id: "demo-3",
    senderName: "Product Notes",
    sender: "edition@product-notes.example",
    subject: "7 idées pour mieux planifier votre semaine",
    preview:
      "Cette semaine : une méthode simple pour réduire les tâches en attente.",
    body: "Bonjour,\n\nDans cette édition, découvrez sept idées simples pour mieux planifier votre semaine et garder du temps pour les tâches importantes.\n\nBonne lecture !",
    receivedAt: "08:31",
    category: "newsletter",
    isRead: true,
    isStarred: false,
  },
  {
    id: "demo-4",
    senderName: "Maison & Co",
    sender: "offres@maison-co.example",
    subject: "Votre offre de bienvenue expire dimanche",
    preview:
      "Profitez de 25 % de réduction sur votre première commande avant dimanche.",
    body: "Votre offre de bienvenue expire bientôt. Profitez de 25 % de réduction sur votre première commande avant dimanche soir.",
    receivedAt: "Hier",
    category: "promotion",
    isRead: true,
    isStarred: false,
  },
  {
    id: "demo-5",
    senderName: "Papa",
    sender: "famille@messages.example",
    subject: "Déjeuner samedi",
    preview:
      "Est-ce que midi te convient toujours ? Je réserve la table demain matin.",
    body: "Salut,\n\nEst-ce que midi te convient toujours pour samedi ? Je réserve la table demain matin. Dis-moi si tu préfères un autre horaire.\n\nÀ bientôt !",
    receivedAt: "Hier",
    category: "personal",
    isRead: false,
    isStarred: true,
  },
  {
    id: "demo-6",
    senderName: "Facturation Cloud",
    sender: "billing@cloud-suite.example",
    subject: "Facture de juillet disponible",
    preview:
      "Votre facture mensuelle est disponible dans votre espace professionnel.",
    body: "Bonjour,\n\nVotre facture mensuelle est maintenant disponible dans votre espace professionnel. Aucun paiement supplémentaire n'est requis.\n\nL'équipe Facturation Cloud",
    receivedAt: "Lun.",
    category: "professional",
    isRead: true,
    isStarred: false,
  },
  {
    id: "demo-7",
    senderName: "Agenda",
    sender: "reminders@calendar.example",
    subject: "Rappel : réunion produit dans 30 minutes",
    preview:
      "Votre réunion produit commence aujourd'hui à 14 h dans la salle virtuelle.",
    body: "Rappel : votre réunion produit commence aujourd'hui à 14 h. Vous pouvez rejoindre la salle virtuelle depuis votre calendrier.",
    receivedAt: "Lun.",
    category: "notification",
    isRead: false,
    isStarred: false,
  },
  {
    id: "demo-8",
    senderName: "Service inconnu",
    sender: "contact@account-alert.example",
    subject: "ACTION IMMÉDIATE REQUISE",
    preview:
      "Votre compte sera suspendu. Confirmez immédiatement vos informations.",
    body: "Votre compte sera suspendu. Confirmez immédiatement vos informations personnelles depuis le lien indiqué dans ce message.",
    receivedAt: "Dim.",
    category: "spam",
    isRead: true,
    isStarred: false,
  },
  {
    id: "demo-9",
    senderName: "Camille Durand",
    sender: "camille@studio-orbite.example",
    subject: "Quelques ressources après notre échange",
    preview:
      "Voici les ressources dont nous avons parlé. Je reste disponible si nécessaire.",
    body: "Bonjour Sacha,\n\nVoici les ressources dont nous avons parlé pendant notre échange. Je reste disponible si tu as besoin d'informations complémentaires.\n\nBonne journée,\nCamille",
    receivedAt: "Ven.",
    category: "other",
    isRead: false,
    isStarred: false,
  },
];
