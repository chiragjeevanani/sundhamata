import { logger } from '../config/logger.js';
import { Customer } from '../models/index.js';
import { OTP_PURPOSES } from '../models/OtpChallenge.js';
import { ApiError } from '../utils/ApiError.js';
import { maskMobile } from '../utils/mobile.js';
import { serializeCustomer } from '../utils/serializers.js';
import { createCustomer } from './customer.service.js';
import * as otpService from './otp.service.js';
import { signCustomerToken } from './token.service.js';

const accountDisabled = () =>
  ApiError.forbidden('This account has been deactivated. Please contact the store.');

/** Whether a customer account exists for this mobile (no personal data returned). */
export const checkCustomer = async (mobile) => {
  const customer = await Customer.findOne({ mobile }, { _id: 1 }).lean();
  return { exists: Boolean(customer) };
};

/** Login OTP for an existing customer. */
export const sendLoginOtp = async (mobile) => {
  const customer = await Customer.findOne({ mobile }, { isActive: 1 }).lean();
  if (!customer) {
    throw ApiError.notFound('No account found for this mobile number. Please register first.');
  }
  if (!customer.isActive) throw accountDisabled();
  return otpService.sendOtp(mobile, { purpose: OTP_PURPOSES.LOGIN });
};

/**
 * Starts self-registration. No Customer is created yet — the details are held
 * with the OTP challenge and the account is created only after verification.
 */
export const startRegistration = async ({ name, mobile, interest, budget }) => {
  if (await Customer.exists({ mobile })) {
    throw ApiError.conflict('This mobile number is already registered. Please sign in instead.', [
      { field: 'mobile', message: 'Already registered' },
    ]);
  }
  return otpService.sendOtp(mobile, {
    purpose: OTP_PURPOSES.REGISTER,
    registration: { name, interest, budget: budget ?? null },
  });
};

/** Resends the OTP for the in-progress flow (login or registration). */
export const resendOtp = async (mobile) => {
  const challenge = await otpService.findActiveChallenge(mobile);
  if (challenge?.purpose === OTP_PURPOSES.REGISTER && challenge.registration?.name) {
    if (await Customer.exists({ mobile })) return sendLoginOtp(mobile);
    return otpService.sendOtp(mobile, { purpose: OTP_PURPOSES.REGISTER, registration: challenge.registration });
  }
  if (await Customer.exists({ mobile })) return sendLoginOtp(mobile);
  throw ApiError.badRequest('No verification in progress for this number. Please start again.');
};

/**
 * Verifies the OTP and signs the customer in. For a pending registration the
 * Customer is created here (after verification), never before.
 */
export const verifyOtpAndSignIn = async (mobile, otp) => {
  const challenge = await otpService.verifyOtp(mobile, otp);

  let customer = await Customer.findOne({ mobile });
  let isNewUser = false;

  if (!customer) {
    if (challenge.purpose !== OTP_PURPOSES.REGISTER || !challenge.registration?.name) {
      throw ApiError.notFound('No account found for this mobile number. Please register first.');
    }
    try {
      customer = await createCustomer(
        {
          name: challenge.registration.name,
          mobile,
          interest: challenge.registration.interest,
          budget: challenge.registration.budget ?? null,
        },
        { source: 'self', verified: true }
      );
      isNewUser = true;
    } catch (err) {
      // Created concurrently (e.g. by the store) — the verified OTP still proves ownership.
      if (err?.statusCode !== 409 && err?.code !== 11000) throw err;
      customer = await Customer.findOne({ mobile });
    }
  }

  if (!customer.isActive) throw accountDisabled();

  // First sign-in to an account the store created (e.g. while billing a purchase to this
  // number): the app asks the customer to confirm the name and details the store entered.
  const needsProfileReview = !isNewUser && !customer.mobileVerifiedAt;

  customer.lastLoginAt = new Date();
  customer.mobileVerifiedAt ??= new Date();
  await customer.save();

  const { token, expiresAt } = signCustomerToken(customer);
  logger.info({ customerId: customer.id, mobile: maskMobile(mobile), isNewUser }, 'Customer authenticated');

  return { token, expiresAt, isNewUser, needsProfileReview, customer: serializeCustomer(customer) };
};
