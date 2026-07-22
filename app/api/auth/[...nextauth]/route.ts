import { handlers } from "@/auth";

/**
 * Point d'entrée serveur utilisé par Google pour la connexion et le callback
 * OAuth. Auth.js protège notamment l'échange avec un état anti-CSRF.
 */
export const { GET, POST } = handlers;
