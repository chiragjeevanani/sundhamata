import * as analyticsService from '../services/analytics.service.js';
import * as customerService from '../services/customer.service.js';
import * as loyaltyService from '../services/loyalty.service.js';
import * as purchaseService from '../services/purchase.service.js';
import * as settingsService from '../services/settings.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { serializeSettings } from '../utils/serializers.js';

// ---- Customers ----------------------------------------------------------

export const listCustomers = async (req, res) => {
  sendSuccess(res, { data: await customerService.listCustomers(req.valid.query) });
};

export const getCustomer = async (req, res) => {
  const customer = await customerService.getCustomerWithStats(req.valid.params.id);
  sendSuccess(res, { data: { customer } });
};

export const createCustomer = async (req, res) => {
  const created = await customerService.createCustomer(req.valid.body, { source: 'admin', createdBy: req.admin });
  const customer = await customerService.getCustomerWithStats(created._id);
  sendCreated(res, { data: { customer }, message: 'Customer created' });
};

export const updateCustomer = async (req, res) => {
  const customer = await customerService.updateCustomer(req.valid.params.id, req.valid.body, req.admin);
  sendSuccess(res, { data: { customer }, message: 'Customer updated' });
};

export const listCustomerPurchases = async (req, res) => {
  await customerService.getCustomerOrThrow(req.valid.params.id);
  const data = await purchaseService.listPurchasesForAdmin({ ...req.valid.query, customerId: req.valid.params.id });
  sendSuccess(res, { data });
};

export const getCustomerLoyalty = async (req, res) => {
  const customer = await customerService.getCustomerOrThrow(req.valid.params.id);
  const [summary, transactions] = await Promise.all([
    loyaltyService.getCustomerLoyaltySummary(customer),
    loyaltyService.listTransactions({ ...req.valid.query, customerId: customer._id }, { audience: 'admin' }),
  ]);
  sendSuccess(res, { data: { summary, transactions } });
};

// ---- Purchases ----------------------------------------------------------

export const listPurchases = async (req, res) => {
  sendSuccess(res, { data: await purchaseService.listPurchasesForAdmin(req.valid.query) });
};

export const getPurchase = async (req, res) => {
  const purchase = await purchaseService.getPurchaseForAdmin(req.valid.params.id);
  sendSuccess(res, { data: { purchase } });
};

export const createPurchase = async (req, res) => {
  const data = await purchaseService.createPurchase(req.valid.body, req.admin);
  sendCreated(res, {
    data,
    message: `Purchase recorded. ${data.purchase.loyalty.pointsEarned} loyalty points credited.`,
  });
};

export const updatePurchase = async (req, res) => {
  const purchase = await purchaseService.updatePurchase(req.valid.params.id, req.valid.body, req.admin);
  sendSuccess(res, { data: { purchase }, message: 'Purchase updated' });
};

export const cancelPurchase = async (req, res) => {
  const data = await purchaseService.cancelPurchase(req.valid.params.id, req.valid.body.reason, req.admin);
  const { pointsReversed, reversalShortfall } = data.loyalty;
  const message =
    reversalShortfall > 0
      ? `Purchase cancelled. ${pointsReversed} points reversed; ${reversalShortfall} points had already been used.`
      : `Purchase cancelled. ${pointsReversed} points reversed.`;
  sendSuccess(res, { data, message });
};

// ---- Loyalty ------------------------------------------------------------

export const listLoyaltyTransactions = async (req, res) => {
  sendSuccess(res, { data: await loyaltyService.listTransactions(req.valid.query, { audience: 'admin' }) });
};

export const getLoyaltySummary = async (_req, res) => {
  sendSuccess(res, { data: await loyaltyService.getAdminLoyaltySummary() });
};

export const adjustLoyalty = async (req, res) => {
  const data = await loyaltyService.adjustPoints(req.valid.body, req.admin);
  sendCreated(res, { data, message: 'Loyalty points adjusted' });
};

// ---- Settings -----------------------------------------------------------

export const getSettings = async (_req, res) => {
  const settings = await settingsService.getSettings();
  sendSuccess(res, { data: { settings: serializeSettings(settings) } });
};

export const updateSettings = async (req, res) => {
  const settings = await settingsService.updateSettings(req.valid.body, req.admin);
  sendSuccess(res, { data: { settings: serializeSettings(settings) }, message: 'Settings updated' });
};

// ---- Dashboard & reports ------------------------------------------------

export const getDashboard = async (_req, res) => {
  sendSuccess(res, { data: await analyticsService.getDashboard() });
};

export const getActivity = async (req, res) => {
  const items = await analyticsService.getRecentActivity(req.valid.query.limit);
  sendSuccess(res, { data: { items } });
};

export const getReportSummary = async (_req, res) => {
  sendSuccess(res, { data: await analyticsService.getReportSummary() });
};
