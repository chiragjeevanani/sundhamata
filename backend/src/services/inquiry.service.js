import { Customer, Inquiry } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPagination, containsRegex, paginated } from '../utils/query.js';

const serializeInquiry = (i, { audience = 'admin' } = {}) => {
  const base = {
    id: i._id.toString(),
    category: i.category,
    budget: i.budget ?? null,
    message: i.message,
    status: i.status,
    createdAt: i.createdAt,
  };
  if (audience !== 'admin') return base;
  const c = i.customerId;
  return {
    ...base,
    adminNote: i.adminNote ?? null,
    customer:
      c && typeof c === 'object' && c.name !== undefined
        ? { id: c._id.toString(), name: c.name, mobile: c.mobile, customerCode: c.customerCode }
        : null,
    updatedAt: i.updatedAt,
  };
};

const CUSTOMER_FIELDS = 'name mobile customerCode';

export const createInquiry = async (customerId, { category, budget, message }) => {
  const inquiry = await Inquiry.create({ customerId, category, budget: budget ?? null, message });
  return serializeInquiry(inquiry, { audience: 'customer' });
};

export const listCustomerInquiries = async (customerId) => {
  const items = await Inquiry.find({ customerId }).sort({ createdAt: -1 }).limit(50).lean();
  return items.map((i) => serializeInquiry(i, { audience: 'customer' }));
};

/** Admin → Inquiries: newest first, with counts per status for the tabs */
export const listInquiries = async ({ page, limit, search, status, category }) => {
  const filter = {};
  if (status !== 'all') filter.status = status;
  if (category !== 'all') filter.category = category;
  if (search) {
    const regex = containsRegex(search);
    const customers = await Customer.find({ $or: [{ name: regex }, { mobile: regex }, { customerCode: regex }] }, { _id: 1 })
      .limit(200)
      .lean();
    filter.$or = [{ message: regex }, { customerId: { $in: customers.map((c) => c._id) } }];
  }
  const { skip } = buildPagination({ page, limit });
  const [items, total, counts] = await Promise.all([
    Inquiry.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).populate('customerId', CUSTOMER_FIELDS).lean(),
    Inquiry.countDocuments(filter),
    Inquiry.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  return {
    ...paginated(items.map((i) => serializeInquiry(i)), { page, limit }, total),
    counts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
  };
};

export const updateInquiry = async (id, patch, admin) => {
  const inquiry = await Inquiry.findByIdAndUpdate(
    id,
    { $set: { ...patch, updatedBy: admin?._id ?? null } },
    { returnDocument: 'after', runValidators: true }
  )
    .populate('customerId', CUSTOMER_FIELDS)
    .lean();
  if (!inquiry) throw ApiError.notFound('Inquiry not found');
  return serializeInquiry(inquiry);
};

export const deleteInquiry = async (id) => {
  const deleted = await Inquiry.findByIdAndDelete(id);
  if (!deleted) throw ApiError.notFound('Inquiry not found');
};
