import mongoose from 'mongoose';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

let transactionsSupported = null;

/**
 * Multi-document transactions need a replica set or a sharded cluster.
 * A standalone mongod (common for local installs) does not support them.
 */
const detectTransactionSupport = async () => {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  return Boolean(hello.setName) || hello.msg === 'isdbgrid';
};

export const connectDatabase = async (uri, options = {}) => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, ...options });
  transactionsSupported = await detectTransactionSupport();
  logger.info(
    { db: mongoose.connection.name, transactionsSupported },
    'MongoDB connected'
  );
  return mongoose.connection;
};

export const disconnectDatabase = async () => {
  await mongoose.disconnect();
  transactionsSupported = null;
};

export const supportsTransactions = () => {
  if (transactionsSupported === null) {
    throw new Error('Database is not connected');
  }
  return transactionsSupported;
};

// Test hook: lets the fallback (non-transactional) path be exercised on a replica set.
export const setTransactionSupportOverride = (value) => {
  transactionsSupported = value;
};

mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
