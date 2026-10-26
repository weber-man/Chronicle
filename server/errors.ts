export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

// Kept for backwards compatibility with older imports/tests.
export const AuthError = HttpError;
