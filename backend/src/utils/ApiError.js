export class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status
   * @param {string} message Safe, user-facing message
   * @param {Array<{field?: string, message: string}>} [errors] Field-level details
   * @param {object} [meta] Extra safe data for the client (e.g. retryAfterSeconds)
   */
  constructor(statusCode, message, errors = [], meta = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.meta = meta;
  }

  static badRequest(message = 'Bad request', errors) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message, errors) {
    return new ApiError(409, message, errors);
  }

  static unprocessable(message = 'Validation failed', errors) {
    return new ApiError(422, message, errors);
  }

  static tooManyRequests(message, meta) {
    return new ApiError(429, message, [], meta);
  }
}
