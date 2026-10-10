export type PublicError = {
  code: "INTERNAL_ERROR";
  message: string;
  requestId: string;
};
export function normalizeError(
  _error: unknown,
  requestId: string,
): PublicError {
  return {
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please try again.",
    requestId,
  };
}
