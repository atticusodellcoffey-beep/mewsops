import { DomainError } from "../domain/types.js";
export function errorEnvelope(error: unknown, requestId: string) {
  if (error instanceof DomainError)
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, requestId } },
    };
  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        requestId,
      },
    },
  };
}
