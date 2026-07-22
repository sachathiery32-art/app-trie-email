import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    error?: "RefreshTokenError";
    /** Données internes acceptées uniquement par `unstable_update` côté serveur. */
    _googleTokenUpdate?: {
      accessToken: string;
      expiresAt: number;
      refreshToken?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    googleAccessToken?: string;
    googleAccessTokenExpiresAt?: number;
    googleRefreshToken?: string;
    error?: "RefreshTokenError";
  }
}

export {};
