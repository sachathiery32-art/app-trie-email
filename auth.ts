import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;

/**
 * Configuration centrale de l'authentification.
 *
 * Google affiche et traite lui-même le formulaire de connexion : l'application
 * ne reçoit jamais le mot de passe de l'utilisateur. Le mode `offline` prépare
 * la récupération d'un refresh token, qui sera stocké en base à l'étape Prisma.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          access_type: "offline",
          include_granted_scopes: "true",
          prompt: "consent",
          response_type: "code",
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.modify",
          ].join(" "),
        },
      },
    }),
  ],
  pages: {
    signIn: "/connexion",
  },
  session: {
    strategy: "jwt",
    maxAge: THIRTY_DAYS_IN_SECONDS,
    updateAge: 24 * 60 * 60,
  },
});
