import Link from "next/link";

import { signInWithGoogle } from "@/app/actions/auth";
import { MailboxIcon } from "@/components/mailbox-icon";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Google n'a pas autorisé cette connexion. Vérifiez l'adresse du compte et acceptez les permissions demandées.",
  Configuration:
    "La connexion Google n'est pas encore complètement configurée.",
  OAuthCallbackError:
    "Google n'a pas pu terminer la connexion. Réessayez dans quelques instants.",
};

/** Écran public minimal affiché tant qu'aucune session n'est active. */
export function GoogleSignIn({ error }: { error?: string }) {
  const errorMessage = error
    ? (AUTH_ERROR_MESSAGES[error] ??
      "La connexion Google a échoué. Vérifiez le compte utilisé puis réessayez.")
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4 py-10 text-[#09090b] sm:px-6">
      <section
        aria-labelledby="signin-title"
        className="w-full max-w-2xl rounded-3xl border border-[#e4e4e7] bg-white p-6 sm:p-10"
      >
        <div className="flex size-12 items-center justify-center rounded-2xl bg-[#18181b] text-white">
          <MailboxIcon name="mail" className="size-6" />
        </div>

        <p className="mt-8 text-sm font-semibold text-[#2563eb]">
          Email Organizer AI
        </p>
        <h1
          id="signin-title"
          className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#09090b] sm:text-4xl"
        >
          Connectez votre espace personnel.
        </h1>
        <p className="mt-4 max-w-md text-base leading-7 text-[#52525b]">
          Continuez avec le compte Gmail personnel autorisé pour ouvrir le
          tableau de bord. Votre mot de passe Gmail n’est jamais transmis à l’application.
        </p>

        {errorMessage ? (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          >
            {errorMessage}
          </p>
        ) : null}

        <form action={signInWithGoogle} className="mt-8">
          <button
            type="submit"
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-[#2563eb] px-5 text-base font-semibold text-white transition-colors duration-200 hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b]"
          >
            <MailboxIcon name="mail" className="size-5" />
            Se connecter avec Google
          </button>
        </form>

        <div className="mt-8 border-t border-[#e4e4e7] pt-6">
          <section aria-labelledby="public-features-title">
            <h2 id="public-features-title" className="font-semibold text-[#18181b]">
              Organisez votre propre boîte Gmail
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#52525b]">
              Email Organizer AI affiche vos messages Gmail, facilite le classement par libellés,
              les brouillons et les rappels, et propose une assistance IA pour résumer ou rédiger.
              Chaque compte conserve un espace séparé.
            </p>
          </section>
          <div className="mt-4 flex gap-3 text-sm leading-6 text-[#52525b]">
            <MailboxIcon
              name="check"
              className="mt-1 size-4 shrink-0 text-[#2563eb]"
            />
            <p>
              L’accès est réservé à l’unique adresse Gmail configurée côté serveur.
            </p>
          </div>
          <nav aria-label="Informations légales" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link href="/privacy" className="font-semibold text-blue-700 hover:underline">
              Confidentialité
            </Link>
            <Link href="/terms" className="font-semibold text-blue-700 hover:underline">
              Conditions d’utilisation
            </Link>
          </nav>
        </div>
      </section>
    </main>
  );
}
