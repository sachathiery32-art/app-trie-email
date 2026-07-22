"use server";

import { signIn, signOut } from "@/auth";

/** Lance le parcours OAuth Google depuis un formulaire côté serveur. */
export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}

/** Ferme uniquement la session de l'application, pas le compte Google. */
export async function signOutFromApp() {
  await signOut({ redirectTo: "/" });
}
