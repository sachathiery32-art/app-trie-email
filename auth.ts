import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { refreshGoogleAccessToken } from "@/lib/google-oauth";

const GMAIL_MODIFY_SCOPE =
  "https://www.googleapis.com/auth/gmail.modify";

/**
 * Configuration centrale de l'authentification.
 *
 * Le client Google est lu depuis AUTH_GOOGLE_ID et AUTH_GOOGLE_SECRET.
 * La liste blanche limite volontairement cette version au seul compte renseigné
 * dans ALLOWED_GOOGLE_EMAIL.
 */
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  providers: [
    Google({
      authorization: {
        params: {
          scope: `openid email profile ${GMAIL_MODIFY_SCOPE}`,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return false;
      }

      const allowedEmail = process.env.ALLOWED_GOOGLE_EMAIL
        ?.trim()
        .toLocaleLowerCase("en-US");
      const googleEmail = profile?.email
        ?.trim()
        .toLocaleLowerCase("en-US");

      // Une variable absente ferme l'accès au lieu de rendre le site public.
      if (!allowedEmail || !googleEmail) {
        return false;
      }

      return profile?.email_verified === true && googleEmail === allowedEmail;
    },
    async jwt({ token, account, trigger, session }) {
      if (account) {
        token.googleAccessToken = account.access_token;
        token.googleAccessTokenExpiresAt = account.expires_at;
        token.googleRefreshToken = account.refresh_token;
        token.error = undefined;
        return token;
      }

      if (trigger === "update" && session?._googleTokenUpdate) {
        token.googleAccessToken = session._googleTokenUpdate.accessToken;
        token.googleAccessTokenExpiresAt = session._googleTokenUpdate.expiresAt;
        token.googleRefreshToken =
          session._googleTokenUpdate.refreshToken ?? token.googleRefreshToken;
        token.error = undefined;
        return token;
      }

      if (
        token.googleAccessToken &&
        typeof token.googleAccessTokenExpiresAt === "number" &&
        Date.now() < (token.googleAccessTokenExpiresAt - 60) * 1000
      ) {
        return token;
      }

      if (!token.googleRefreshToken) {
        return token;
      }

      try {
        const refreshedTokens = await refreshGoogleAccessToken(
          token.googleRefreshToken,
        );

        token.googleAccessToken = refreshedTokens.accessToken;
        token.googleAccessTokenExpiresAt = refreshedTokens.expiresAt;
        token.googleRefreshToken =
          refreshedTokens.refreshToken ?? token.googleRefreshToken;
        token.error = undefined;
      } catch {
        token.error = "RefreshTokenError";
      }

      return token;
    },
    async session({ session, token }) {
      session.error = token.error;
      return session;
    },
  },
});
