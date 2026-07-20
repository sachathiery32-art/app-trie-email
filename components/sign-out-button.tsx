"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOut({ redirectTo: "/connexion" });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      className="hidden min-h-11 cursor-pointer items-center justify-center rounded-xl border border-[#d9dce2] bg-white px-3 text-sm font-semibold text-[#4d5768] transition-colors duration-200 hover:border-[#aeb4bf] hover:bg-[#f7f7f8] hover:text-[#171717] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] disabled:cursor-not-allowed disabled:text-[#98a0ad] sm:inline-flex"
    >
      {isSigningOut ? "Déconnexion…" : "Se déconnecter"}
    </button>
  );
}
