import * as billService from '../services/bill.service.js';
import * as customerService from '../services/customer.service.js';
import * as loyaltyService from '../services/loyalty.service.js';
import * as purchaseService from '../services/purchase.service.js';
import { getSettings } from '../services/settings.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { serializeCustomer, serializePublicStore } from '../utils/serializers.js';

// Every handler scopes queries to req.customer._id — customers can only ever
// see their own profile, purchases and loyalty entries.

export const getMe = async (req, res) => {
  sendSuccess(res, { data: { customer: serializeCustomer(req.customer) } });
};

export const updateMe = async (req, res) => {
  const customer = await customerService.updateOwnProfile(req.customer, req.valid.body);
  sendSuccess(res, { data: { customer: serializeCustomer(customer) }, message: 'Profile updated' });
};

export const listMyPurchases = async (req, res) => {
  const data = await purchaseService.listPurchasesForCustomer(req.customer._id, req.valid.query);
  sendSuccess(res, { data });
};

export const getMyPurchase = async (req, res) => {
  const purchase = await purchaseService.getPurchaseForCustomer(req.customer._id, req.valid.params.id);
  sendSuccess(res, { data: { purchase } });
};

export const downloadMyPurchaseBill = async (req, res) => {
  await billService.sendBill(res, { purchaseId: req.valid.params.id, customerId: req.customer._id });
};

export const getMyLoyalty = async (req, res) => {
  const data = await loyaltyService.getCustomerLoyaltyOverview(req.customer);
  sendSuccess(res, { data });
};

export const getMyLoyaltySummary = async (req, res) => {
  const data = await loyaltyService.getCustomerLoyaltySummary(req.customer);
  sendSuccess(res, { data });
};

export const listMyLoyaltyTransactions = async (req, res) => {
  const data = await loyaltyService.listTransactions(
    { ...req.valid.query, customerId: req.customer._id },
    { audience: 'customer' }
  );
  sendSuccess(res, { data });
};

export const getMyLoyaltyTransaction = async (req, res) => {
  const transaction = await loyaltyService.getCustomerTransaction(req.customer._id, req.valid.params.id);
  sendSuccess(res, { data: { transaction } });
};

export const getStore = async (_req, res) => {
  const settings = await getSettings();
  sendSuccess(res, { data: { store: serializePublicStore(settings) } });
};
