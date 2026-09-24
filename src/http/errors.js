export class HttpError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function mapDatabaseError(error) {
  if (error instanceof HttpError) return error;
  if (error?.code === '23505') return new HttpError(409, 'CONFLICT', 'A conflicting record already exists.');
  if (error?.code === '23503') return new HttpError(422, 'REFERENCE_ERROR', 'A referenced record does not exist.');
  if (error?.code === '23514') return new HttpError(422, 'CONSTRAINT_VIOLATION', error.message);
  if (error?.code === '42501') return new HttpError(403, 'FORBIDDEN', 'Database security policy denied the operation.');
  if (error?.code === 'P0001') return new HttpError(409, 'BUSINESS_RULE_VIOLATION', error.message);
  return error;
}
