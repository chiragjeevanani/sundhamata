export const sendSuccess = (res, { data = null, message = 'OK', statusCode = 200 } = {}) =>
  res.status(statusCode).json({ success: true, data, message });

export const sendCreated = (res, { data, message = 'Created' }) =>
  sendSuccess(res, { data, message, statusCode: 201 });
