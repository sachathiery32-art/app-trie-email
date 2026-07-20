import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { isGoogleAuthConfigured } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export default async function ConnectionPage() {
  const isConfigured = isGoogleAuthConfigured();

  if (isConfigured) {
    const session = await auth();

    if (session?.user) {
      redirect("/");
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,0.92fr)_minmax(520px,1.08fr)]">
      <section className="flex min-h-72 flex-col justify-between bg-[#171717] p-6 text-white sm:p-10 lg:min-h-screen lg:p-14">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#d4af37] text-[#171717]">
            <svg
              aria-hidden="true"
              className="size-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75 12 12l8.25-5.25M5.25 19.5h13.5A2.25 2.25 0 0 0 21 17.25V6.75a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
          <div>
            <p className="font-semibold tracking-tight">Email Organizer AI</p>
            <p className="text-xs text-white/60">Votre boîte, mieux organisée</p>
          </div>
        </div>

        <div className="max-w-xl py-10 lg:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#d4af37]">
            Connexion sécurisée
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">
            Reprenez le contrôle de votre boîte de réception.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-white/70">
            Connectez votre compte Google, puis laissez l’intelligence
            artificielle vous aider à retrouver les emails qui comptent.
          </p>

          <ul className="mt-8 grid gap-4 text-sm text-white/80 sm:grid-cols-3 lg:grid-cols-1">
            {[
              "Mot de passe traité uniquement par Google",
              "Session sécurisée pendant 30 jours",
              "Autorisation révocable à tout moment",
            ].map((benefit) => (
              <li key={benefit} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#d4af37] text-[#171717]">
                  <svg
                    aria-hidden="true"
                    className="size-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m5 12 4 4L19 6"
                    />
                  </svg>
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/45">
          Aucun mot de passe Google n’est reçu ou conservé par l’application.
        </p>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10 lg:p-14">
        <div className="w-full max-w-md">
          <p className="text-sm font-semibold text-[#826408]">Bienvenue</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#171717]">
            Accédez à votre espace
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#667085]">
            Google vérifie votre identité et vous redirige ensuite vers votre
            tableau de bord.
          </p>

          <div className="mt-8">
            {isConfigured ? (
              <GoogleSignInButton />
            ) : (
              <div
                role="status"
                className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
              >
                <p className="font-semibold text-amber-950">
                  Configuration Google requise
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  Ajoutez les trois variables OAuth dans Vercel pour activer le
                  bouton de connexion.
                </p>
                <div className="mt-4 space-y-2">
                  {[
                    "AUTH_GOOGLE_ID",
                    "AUTH_GOOGLE_SECRET",
                    "AUTH_SECRET",
                  ].map((variableName) => (
                    <code
                      key={variableName}
                      className="block rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-amber-950"
                    >
                      {variableName}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 border-t border-[#e3e6eb] pt-5">
            <div className="flex items-start gap-3">
              <svg
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-[#667085]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 0 0-9 0v3.75m-.75 0h10.5a2.25 2.25 0 0 1 2.25 2.25v6A2.25 2.25 0 0 1 17.25 21H6.75a2.25 2.25 0 0 1-2.25-2.25v-6a2.25 2.25 0 0 1 2.25-2.25Z"
                />
              </svg>
              <p className="text-xs leading-5 text-[#667085]">
                La connexion utilise OAuth 2.0. Vous pourrez retirer l’accès
                depuis les paramètres de votre compte Google.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
