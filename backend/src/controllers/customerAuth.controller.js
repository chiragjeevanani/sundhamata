import * as customerAuthService from '../services/customerAuth.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const check = async (req, res) => {
  const { exists } = await customerAuthService.checkCustomer(req.valid.body.mobile);
  sendSuccess(res, {
    data: { exists, isRegistered: exists },
    message: exists ? 'Customer found' : 'No customer registered with this mobile number',
  });
};

export const sendOtp = async (req, res) => {
  const data = await customerAuthService.sendLoginOtp(req.valid.body.mobile);
  sendSuccess(res, { data, message: 'OTP sent' });
};

export const register = async (req, res) => {
  const data = await customerAuthService.startRegistration(req.valid.body);
  sendSuccess(res, {
    data: { ...data, otpSent: true },
    message: 'Verification OTP sent. Your account will be created once the OTP is verified.',
  });
};

export const resendOtp = async (req, res) => {
  const data = await customerAuthService.resendOtp(req.valid.body.mobile);
  sendSuccess(res, { data, message: 'OTP resent' });
};

export const verifyOtp = async (req, res) => {
  const { mobile, otp } = req.valid.body;
  const data = await customerAuthService.verifyOtpAndSignIn(mobile, otp);
  sendSuccess(res, { data, message: data.isNewUser ? 'Account created' : 'Signed in' });
};
