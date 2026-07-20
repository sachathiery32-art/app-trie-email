import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { EmailSortingDashboard } from "@/components/email-sorting-dashboard";
import { isGoogleAuthConfigured } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

/** Page d'accueil utilisateur : le backend Groq reste accessible via /api. */
export default async function Home() {
  if (!isGoogleAuthConfigured()) {
    redirect("/connexion");
  }

  const session = await auth();

  if (!session?.user) {
    redirect("/connexion");
  }

  return (
    <EmailSortingDashboard
      user={{
        name: session.user.name,
        email: session.user.email,
      }}
    />
  );
}
