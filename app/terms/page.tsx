import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Conditions d’utilisation | Email Organizer AI",
  description: "Conditions applicables à l’utilisation d’Email Organizer AI.",
};

const legalName = process.env.LEGAL_NAME?.trim() || "L’éditeur d’Email Organizer AI";
const supportEmail = process.env.SUPPORT_EMAIL?.trim();

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#fafafa] px-4 py-10 text-[#18181b] sm:px-6">
      <article className="mx-auto max-w-3xl rounded-3xl border border-[#e4e4e7] bg-white p-6 shadow-sm sm:p-10">
        <Link href="/" className="text-sm font-semibold text-blue-700 hover:underline">
          ← Retour à Email Organizer AI
        </Link>
        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.12em] text-blue-700">
          Informations publiques
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          Conditions d’utilisation
        </h1>
        <p className="mt-3 text-sm text-[#71717a]">Dernière mise à jour : 30 août 2026</p>

        <div className="mt-8 grid gap-8 text-base leading-7 text-[#3f3f46]">
          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Objet du service</h2>
            <p className="mt-2">
              Email Organizer AI, exploité par {legalName}, est un client de messagerie qui permet à un utilisateur
              de consulter et organiser sa propre boîte Gmail, de préparer des messages et d’utiliser des fonctions
              d’assistance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Compte et autorisations</h2>
            <p className="mt-2">
              Vous devez utiliser un compte Google qui vous appartient et ne donner que les autorisations que vous
              comprenez. Vous pouvez retirer l’accès depuis votre compte Google. Vous restez responsable des messages,
              destinataires, règles et actions validés depuis votre session.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Utilisation acceptable</h2>
            <p className="mt-2">
              Il est interdit d’utiliser le service pour accéder au compte d’un tiers sans autorisation, contourner
              les protections de Google, envoyer du spam, diffuser un contenu illégal ou perturber le service et ses
              fournisseurs.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Assistance IA</h2>
            <p className="mt-2">
              Les suggestions produites par l’IA peuvent être inexactes. Vous devez relire les catégories, résumés et
              brouillons avant de les utiliser ou d’envoyer un message. Le service ne garantit pas l’exactitude d’une
              suggestion automatisée.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Disponibilité</h2>
            <p className="mt-2">
              Le fonctionnement dépend notamment de Google, xKiro et des prestataires d’hébergement. Des interruptions,
              limitations de quota ou modifications de ces services peuvent affecter certaines fonctions. Le service
              peut évoluer pour des raisons techniques, de sécurité ou de conformité.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Fin d’utilisation</h2>
            <p className="mt-2">
              Vous pouvez cesser d’utiliser l’application, vous déconnecter et révoquer son accès dans votre compte
              Google. Pour demander la suppression des données applicatives, contactez {supportEmail ? (
                <a className="font-semibold text-blue-700 hover:underline" href={`mailto:${supportEmail}`}>
                  {supportEmail}
                </a>
              ) : "l’adresse d’assistance indiquée sur l’écran de consentement Google"}.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
