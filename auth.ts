import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { refreshGoogleAccessToken } from "@/lib/google-oauth";
import { persistGoogleRefreshToken } from "@/lib/mail-store";

const GMAIL_MODIFY_SCOPE =
  "https://www.googleapis.com/auth/gmail.modify";
const CONTACTS_READ_SCOPE =
  "https://www.googleapis.com/auth/contacts.readonly";

/**
 * Configuration centrale de l'authentification.
 *
 * Le client Google est lu depuis AUTH_GOOGLE_ID et AUTH_GOOGLE_SECRET.
 * Une liste blanche serveur réserve cette version personnelle à l'adresse
 * configurée dans ALLOWED_GOOGLE_EMAIL.
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
          scope: `openid email profile ${GMAIL_MODIFY_SCOPE} ${CONTACTS_READ_SCOPE}`,
          access_type: "offline",
          prompt: "consent select_account",
          include_granted_scopes: "true",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return false;
      }

      const googleEmail = profile?.email
        ?.trim()
        .toLocaleLowerCase("en-US");
      const allowedEmail = process.env.ALLOWED_GOOGLE_EMAIL
        ?.trim()
        .toLocaleLowerCase("en-US");

      const authorized =
        profile?.email_verified === true &&
        Boolean(googleEmail) &&
        Boolean(allowedEmail) &&
        googleEmail === allowedEmail;
      if (authorized && googleEmail && account.refresh_token) {
        try {
          await persistGoogleRefreshToken(googleEmail, account.refresh_token);
        } catch (error) {
          console.error("Le jeton Google n'a pas pu être conservé pour la synchronisation.", error);
        }
      }
      return authorized;
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
        if (refreshedTokens.refreshToken && typeof token.email === "string") {
          await persistGoogleRefreshToken(
            token.email,
            refreshedTokens.refreshToken,
          ).catch((error) =>
            console.error("Le jeton Google renouvelé n'a pas pu être conservé.", error),
          );
        }
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
