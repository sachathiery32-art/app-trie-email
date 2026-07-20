import { EmailClassificationForm } from "@/components/email-classification-form";
import { GroqConnectionTest } from "@/components/groq-connection-test";

const requestSteps = [
  {
    number: "01",
    title: "Le navigateur appelle Next.js",
    description: "Un clic envoie une requête GET vers /api/test.",
  },
  {
    number: "02",
    title: "Le serveur contacte Groq",
    description: "La route utilise le client sécurisé défini dans lib/groq.ts.",
  },
  {
    number: "03",
    title: "La réponse revient ici",
    description: "L'interface affiche le message sans jamais recevoir votre clé.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7f6f2] text-neutral-950">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center bg-neutral-950 text-white">
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
              <p className="text-xs text-neutral-500">Prototype technique</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 text-sm text-neutral-600 sm:flex">
            <span className="size-2 rounded-full bg-emerald-600" />
            Groq connecté
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:py-24">
          <div aria-labelledby="page-title">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8a6a08]">
              Étape 2 · Connexion validée
            </p>
            <h1
              id="page-title"
              className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl"
            >
              Testez votre connexion Groq depuis l’interface.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8">
              Cette page relie le frontend React à votre première route backend.
              Elle permet de visualiser chaque état de la requête sans exposer
              d’information sensible.
            </p>

            <ol className="mt-10 grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
              {requestSteps.map((step) => (
                <li key={step.number} className="flex gap-4">
                  <span className="font-mono text-sm font-semibold text-[#8a6a08]">
                    {step.number}
                  </span>
                  <div>
                    <h2 className="font-semibold text-neutral-900">
                      {step.title}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-neutral-600">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <GroqConnectionTest />
        </section>

        <section
          aria-labelledby="classification-title"
          className="border-t border-neutral-200 bg-white"
        >
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16 lg:py-24">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8a6a08]">
                Étape 3 · Première fonctionnalité métier
              </p>
              <h2
                id="classification-title"
                className="mt-4 text-3xl font-semibold tracking-[-0.025em] sm:text-4xl"
              >
                Essayez la classification d’un email fictif.
              </h2>
              <p className="mt-4 text-base leading-7 text-neutral-600">
                Le formulaire envoie trois champs à{" "}
                <code className="font-mono text-sm text-neutral-800">
                  POST /api/classify
                </code>
                . Groq retourne ensuite une catégorie contrôlée et une
                justification courte.
              </p>
            </div>

            <EmailClassificationForm />
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200 bg-[#f7f6f2]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>Email Organizer AI · Prototype Groq</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <code className="font-mono text-neutral-600">GET /api/test</code>
            <code className="font-mono text-neutral-600">
              POST /api/classify
            </code>
          </div>
        </div>
      </footer>
    </div>
  );
}
