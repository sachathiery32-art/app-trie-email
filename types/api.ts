/** Forme commune des erreurs renvoyées par nos routes API. */
export type ApiErrorResponse = {
  success: false;
  error: string;
};
