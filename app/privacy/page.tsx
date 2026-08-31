import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politique de confidentialité | Email Organizer AI",
  description: "Utilisation et protection des données dans Email Organizer AI.",
};

const legalName = process.env.LEGAL_NAME?.trim() || "L’éditeur d’Email Organizer AI";
const supportEmail = process.env.SUPPORT_EMAIL?.trim();

export default function PrivacyPage() {
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
          Politique de confidentialité
        </h1>
        <p className="mt-3 text-sm text-[#71717a]">Dernière mise à jour : 30 août 2026</p>

        <div className="mt-8 grid gap-8 text-base leading-7 text-[#3f3f46]">
          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Responsable du service</h2>
            <p className="mt-2">Le service Email Organizer AI est exploité par {legalName}.</p>
            <p className="mt-2">
              Pour toute question ou demande liée aux données, contactez {supportEmail ? (
                <a className="font-semibold text-blue-700 hover:underline" href={`mailto:${supportEmail}`}>
                  {supportEmail}
                </a>
              ) : "l’adresse d’assistance indiquée sur l’écran de consentement Google"}.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Données auxquelles l’application accède</h2>
            <p className="mt-2">
              Après votre consentement Google, l’application accède à votre identité de compte, à votre boîte
              Gmail, à vos libellés, brouillons et pièces jointes, ainsi qu’à vos contacts Google en lecture seule.
              Elle n’obtient jamais votre mot de passe Google.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Utilisation des données</h2>
            <p className="mt-2">
              Ces données servent uniquement à afficher et organiser votre messagerie, rechercher et modifier vos
              emails, créer ou envoyer vos brouillons, suggérer des destinataires, exécuter vos règles et fournir
              les fonctions d’assistance que vous demandez.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Fonctions d’intelligence artificielle</h2>
            <p className="mt-2">
              Lorsque vous utilisez une fonction IA, ou lorsque vous activez le classement automatique, les extraits
              nécessaires des emails concernés peuvent être transmis à xKiro afin d’utiliser le modèle Qwen3.8 Max.
              Aucun contenu Gmail n’est vendu ni utilisé par Email Organizer AI pour faire de la publicité.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Stockage et sécurité</h2>
            <p className="mt-2">
              Les messages complets restent chez Gmail. Le service peut conserver un jeton Google chiffré, vos
              préférences, signatures, modèles, règles, identifiants de tâches différées, rappels et notifications.
              Toutes ces données sont séparées par compte Google. Les secrets d’accès restent côté serveur.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Conservation et suppression</h2>
            <p className="mt-2">
              Les données applicatives sont conservées tant que votre compte utilise le service ou qu’elles sont
              nécessaires à une tâche demandée. Vous pouvez révoquer l’accès depuis les paramètres de sécurité de
              votre compte Google et demander la suppression des données applicatives à l’adresse d’assistance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Partage et transfert</h2>
            <p className="mt-2">
              Les données ne sont communiquées qu’aux services techniques nécessaires au fonctionnement : Google
              pour Gmail et OAuth, xKiro pour les fonctions IA demandées, ainsi que les prestataires d’hébergement et
              de base de données configurés par l’éditeur. Elles ne sont pas revendues.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Vos droits</h2>
            <p className="mt-2">
              Vous pouvez demander l’accès, la rectification, l’export ou la suppression des données applicatives
              vous concernant en contactant l’assistance. Vous pouvez également retirer à tout moment l’autorisation
              Google depuis votre compte Google.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#18181b]">Règles relatives aux données Google</h2>
            <p className="mt-2">
              L’utilisation et le transfert des informations reçues depuis les API Google respectent la{" "}
              <a
                className="font-semibold text-blue-700 hover:underline"
                href="https://developers.google.com/terms/api-services-user-data-policy"
                rel="noreferrer"
                target="_blank"
              >
                Google API Services User Data Policy
              </a>
              , y compris ses exigences d’utilisation limitée.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
