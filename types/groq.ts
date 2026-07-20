import type { ApiErrorResponse } from "@/types/api";

export type GroqTestSuccessResponse = {
  success: true;
  data: {
    message: string;
    model: string;
  };
};

/** Contrat JSON partagé entre la route API et l'interface. */
export type GroqTestResponse = GroqTestSuccessResponse | ApiErrorResponse;
