import { Customer, Inquiry, nextSequence } from '../models/index.js';
import { LEAD_SEQUENCE, OPEN_STATUSES, formatLeadCode, parseLeadCode } from '../models/Inquiry.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPagination, containsRegex, paginated } from '../utils/query.js';
import { deleteInquiryPhotoFile } from './inquiryPhoto.service.js';

export const serializeInquiry = (i, { audience = 'admin' } = {}) => {
  const base = {
    id: i._id.toString(),
    // "SM-001": the lead's serial number, to quote on the phone
    leadCode: formatLeadCode(i.leadNumber),
    category: i.category,
    budget: i.budget ?? null,
    message: i.message ?? null,
    mobile: i.mobile
      ? { brand: i.mobile.brand, ramRom: i.mobile.ramRom, features: i.mobile.features ?? [] }
      : null,
    accessories: i.accessories
      ? {
          type: i.accessories.type,
          item: i.accessories.item,
          brandPreference: i.accessories.brandPreference ?? null,
          device: i.accessories.device ?? null,
          quantity: i.accessories.quantity ?? 1,
        }
      : null,
    service: i.service
      ? {
          device: i.service.device,
          brandModel: i.service.brandModel,
          problem: i.service.problem,
          details: i.service.details ?? null,
          preference: i.service.preference,
        }
      : null,
    photo: i.photo?.key ? { path: `/inquiry-photos/${i.photo.key}` } : null,
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

export const createInquiry = async (customerId, { category, budget, message, mobile, accessories, service }) => {
  const inquiry = await Inquiry.create({
    leadNumber: await nextSequence(LEAD_SEQUENCE),
    customerId,
    category,
    budget: budget ?? null,
    message,
    mobile: mobile ?? null,
    accessories: accessories ?? null,
    service: service ?? null,
  });
  return serializeInquiry(inquiry, { audience: 'customer' });
};

export const listCustomerInquiries = async (customerId) => {
  const items = await Inquiry.find({ customerId }).sort({ createdAt: -1 }).limit(50).lean();
  return items.map((i) => serializeInquiry(i, { audience: 'customer' }));
};

/** Admin → Leads: newest first, with counts per status for the tabs. "open" = not closed yet (new or contacted) */
export const listInquiries = async ({ page, limit, search, status, category }) => {
  const filter = {};
  if (status === 'open') filter.status = { $in: OPEN_STATUSES };
  else if (status !== 'all') filter.status = status;
  if (category !== 'all') filter.category = category;
  if (search) {
    const regex = containsRegex(search);
    const customers = await Customer.find({ $or: [{ name: regex }, { mobile: regex }, { customerCode: regex }] }, { _id: 1 })
      .limit(200)
      .lean();
    // "SM-004" / "sm4" finds that lead by its number
    const leadNumber = parseLeadCode(search);
    filter.$or = [...(leadNumber ? [{ leadNumber }] : []), { message: regex }, { 'mobile.brand': regex }, { 'mobile.ramRom': regex }, { 'accessories.item': regex }, { 'accessories.brandPreference': regex }, { 'accessories.device': regex }, { 'service.brandModel': regex }, { 'service.problem': regex }, { 'service.details': regex }, { customerId: { $in: customers.map((c) => c._id) } }];
  }
  const { skip } = buildPagination({ page, limit });
  const [items, total, counts] = await Promise.all([
    Inquiry.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).populate('customerId', CUSTOMER_FIELDS).lean(),
    Inquiry.countDocuments(filter),
    Inquiry.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  byStatus.open = OPEN_STATUSES.reduce((sum, key) => sum + (byStatus[key] ?? 0), 0);
  return {
    ...paginated(items.map((i) => serializeInquiry(i)), { page, limit }, total),
    counts: byStatus,
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
  await deleteInquiryPhotoFile(deleted.photo?.fileId);
};
