import mongoose from 'mongoose';

export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive "contains" regex for user-supplied search text. */
export const containsRegex = (value) => new RegExp(escapeRegex(value.trim()), 'i');

export const isObjectId = (value) =>
  typeof value === 'string' && mongoose.isValidObjectId(value) && /^[a-f\d]{24}$/i.test(value);

export const buildPagination = ({ page, limit }) => ({
  page,
  limit,
  skip: (page - 1) * limit,
});

export const paginated = (items, { page, limit }, total) => ({
  items,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  },
});

/** "-createdAt" → { createdAt: -1 }, always with _id as a stable tiebreaker. */
export const parseSort = (sort, fallback = '-createdAt') => {
  const value = sort || fallback;
  const field = value.replace(/^-/, '');
  const direction = value.startsWith('-') ? -1 : 1;
  return { [field]: direction, _id: direction };
};
