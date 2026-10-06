import { logger } from '../config/logger.js';
import { Product, Purchase } from '../models/index.js';
import { productKeyOf } from '../models/Product.js';
import { PURCHASE_STATUSES } from '../models/Purchase.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPagination, containsRegex, paginated } from '../utils/query.js';
import { serializeProduct } from '../utils/serializers.js';

const MAX_CHOICES = 12;

/** Adds `value` to the front of a most-recent-first list (no duplicates, ignoring case). */
const pushRecent = (list = [], value) => {
  if (!value) return list;
  const rest = list.filter((item) => item.toLowerCase() !== value.toLowerCase());
  return [value, ...rest].slice(0, MAX_CHOICES);
};

/**
 * Remembers the products of a recorded purchase (one entry per product name).
 * Best effort: the purchase is already saved, so a catalog problem never fails it.
 * @param {Array<{ product, category, pricing, warranty, purchaseDate }>} lines
 */
export const learnFromPurchaseLines = async (lines) => {
  for (const line of lines) {
    try {
      const nameKey = productKeyOf(line.product.name);
      if (!nameKey) continue;
      const existing = await Product.findOne({ nameKey }).lean();
      const soldAt = line.purchaseDate ?? new Date();
      const isLatest = !existing?.lastSoldAt || soldAt >= existing.lastSoldAt;
      const update = {
        $setOnInsert: { name: line.product.name.trim().replace(/\s+/g, ' '), nameKey, source: 'purchase' },
        $inc: { timesSold: 1 },
        $set: {
          variants: pushRecent(existing?.variants, line.product.variant),
          colors: pushRecent(existing?.colors, line.product.color),
        },
      };
      // The newest sale decides the suggested category, brand, model, price and warranty
      if (isLatest) {
        Object.assign(update.$set, {
          category: line.category,
          lastSoldAt: soldAt,
          lastPrice: line.pricing?.purchaseAmount ?? existing?.lastPrice ?? null,
          warrantyMonths: line.warranty?.months ?? 0,
          ...(line.product.brand ? { brand: line.product.brand } : {}),
          ...(line.product.model ? { model: line.product.model } : {}),
          ...(line.product.hsn ? { hsn: line.product.hsn } : {}),
        });
      }
      await Product.updateOne({ nameKey }, update, { upsert: true });
    } catch (err) {
      logger.warn({ err, product: line?.product?.name }, 'Could not update the product catalog');
    }
  }
};

let rebuildPromise = null;

/** Fills an empty catalog from all past purchases (runs once, e.g. right after this feature ships). */
export const ensureCatalogBuilt = async () => {
  if (await Product.estimatedDocumentCount()) return;
  rebuildPromise ??= (async () => {
    const lines = await Purchase.find(
      { status: PURCHASE_STATUSES.PURCHASED },
      { product: 1, category: 1, pricing: 1, warranty: 1, purchaseDate: 1 }
    )
      .sort({ purchaseDate: 1 })
      .lean();
    await learnFromPurchaseLines(lines);
    logger.info({ purchases: lines.length }, 'Product catalog built from past purchases');
  })().finally(() => {
    rebuildPromise = null;
  });
  await rebuildPromise;
};

/** Catalog for the Products page and the Record Purchase suggestions (most sold first). */
export const listProducts = async ({ page, limit, search, category }) => {
  await ensureCatalogBuilt();
  const filter = {};
  if (category && category !== 'all') filter.category = category;
  if (search) {
    const regex = containsRegex(search);
    filter.$or = [{ name: regex }, { brand: regex }, { model: regex }];
  }
  const { skip } = buildPagination({ page, limit });
  const [rows, total] = await Promise.all([
    Product.find(filter).sort({ timesSold: -1, lastSoldAt: -1, name: 1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  return paginated(rows.map(serializeProduct), { page, limit }, total);
};

const duplicateName = () =>
  ApiError.conflict('A product with this name already exists', [{ field: 'name', message: 'Already in the catalog' }]);

export const createProduct = async (data) => {
  const nameKey = productKeyOf(data.name);
  if (await Product.exists({ nameKey })) throw duplicateName();
  try {
    const product = await Product.create({ ...data, nameKey, source: 'admin' });
    return serializeProduct(product.toObject());
  } catch (err) {
    if (err?.code === 11000) throw duplicateName();
    throw err;
  }
};

export const updateProduct = async (id, patch) => {
  const $set = { ...patch };
  if (patch.name) {
    $set.nameKey = productKeyOf(patch.name);
    if (await Product.exists({ nameKey: $set.nameKey, _id: { $ne: id } })) throw duplicateName();
  }
  try {
    const product = await Product.findByIdAndUpdate(id, { $set }, { returnDocument: 'after', runValidators: true }).lean();
    if (!product) throw ApiError.notFound('Product not found');
    return serializeProduct(product);
  } catch (err) {
    if (err?.code === 11000) throw duplicateName();
    throw err;
  }
};

/** Removes a product from the suggestions (past purchases are not affected). */
export const deleteProduct = async (id) => {
  const deleted = await Product.findByIdAndDelete(id).lean();
  if (!deleted) throw ApiError.notFound('Product not found');
};
