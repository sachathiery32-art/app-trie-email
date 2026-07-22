import { auth } from "@/auth";
import { GmailInbox } from "@/components/gmail-inbox";
import { GoogleSignIn } from "@/components/google-sign-in";

type HomePageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

/**
 * La page reste côté serveur : aucun contenu de la boîte n'est rendu avant la
 * validation de la session Google.
 */
export default async function Home({ searchParams }: HomePageProps) {
  const [session, params] = await Promise.all([auth(), searchParams]);

  if (!session?.user?.email) {
    const error = Array.isArray(params.error) ? params.error[0] : params.error;
    return <GoogleSignIn error={error} />;
  }

  return (
    <GmailInbox
      user={{
        name: session.user.name,
        email: session.user.email,
      }}
    />
  );
}
