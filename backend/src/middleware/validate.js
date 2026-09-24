import { ApiError } from '../utils/ApiError.js';

export const formatZodIssues = (issues) =>
  issues.map((issue) => {
    // Unknown keys are reported on the parent object; point at the offending key(s) instead.
    const path = issue.code === 'unrecognized_keys' ? [...issue.path, issue.keys.join(',')] : issue.path;
    return { field: path.length ? path.join('.') : undefined, message: issue.message };
  });

/**
 * Validates and normalizes request parts. Parsed values are exposed on
 * `req.valid.{body,query,params}` (Express 5 makes req.query read-only).
 * @param {{ body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType }} schemas
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid ??= {};
  const errors = [];

  for (const part of ['params', 'query', 'body']) {
    const schema = schemas[part];
    if (!schema) continue;
    const result = schema.safeParse(req[part] ?? {});
    if (result.success) {
      req.valid[part] = result.data;
    } else {
      errors.push(...formatZodIssues(result.error.issues));
    }
  }

  if (errors.length) {
    // A malformed id in the URL means "not found", not a client validation problem.
    if (schemas.params && errors.some((e) => e.field === 'id')) {
      return next(ApiError.notFound());
    }
    return next(ApiError.unprocessable('Validation failed', errors));
  }
  return next();
};
