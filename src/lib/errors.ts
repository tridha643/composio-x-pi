export class UserFacingError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "UserFacingError";
    this.code = code;
    this.details = details;
  }
}

export function toUserFacingError(
  error: unknown,
  fallbackMessage = "Unexpected error while executing the tool.",
): UserFacingError {
  if (error instanceof UserFacingError) {
    return error;
  }

  if (error instanceof Error) {
    return new UserFacingError("UNEXPECTED_ERROR", error.message || fallbackMessage, {
      name: error.name,
      cause: error.cause,
    });
  }

  return new UserFacingError("UNEXPECTED_ERROR", fallbackMessage, {
    error,
  });
}
