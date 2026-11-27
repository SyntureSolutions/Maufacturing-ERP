/** An error that already knows which HTTP status it should become. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const statusOf = (err: any, fallback = 500) => {
  if (err instanceof HttpError) return err.status;
  if (err?.name === 'ValidationError' || err?.name === 'CastError') return 400; // the request was wrong, not the server
  if (err?.code === 11000) return 409; // already exists
  return /locked/.test(String(err?.message)) ? 422 : fallback;
};
