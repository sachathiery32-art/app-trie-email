import { signIn } from "@/auth";

/** Bouton serveur : Auth.js redirige le navigateur vers accounts.google.com. */
export function GoogleSignInButton() {
  async function connectWithGoogle() {
    "use server";

    await signIn("google", { redirectTo: "/" });
  }

  return (
    <form action={connectWithGoogle}>
      <button
        type="submit"
        className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-[#171717] px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#333333] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717]"
      >
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
            d="M15.75 7.5V6a3.75 3.75 0 0 0-7.5 0v1.5m-.75 0h9A2.25 2.25 0 0 1 18.75 9.75v8.5A2.25 2.25 0 0 1 16.5 20.5h-9a2.25 2.25 0 0 1-2.25-2.25v-8.5A2.25 2.25 0 0 1 7.5 7.5Z"
          />
        </svg>
        Continuer avec Google
      </button>
    </form>
  );
}
