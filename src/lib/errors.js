export class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function assert(condition, message, status = 400, code = 'BAD_REQUEST') {
  if (!condition) throw new AppError(message, status, code);
}
