import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { supportsTransactions } from '../config/db.js';

/**
 * Runs `work` atomically.
 *
 * On a replica set / sharded cluster the work runs inside a MongoDB transaction
 * (with the driver's automatic retry on transient errors), so every write either
 * commits together or not at all.
 *
 * On a standalone mongod (local development only) transactions are unavailable.
 * The work then runs without a session, and every step registers a compensating
 * action through `onRollback`; if any later step throws, the compensations run
 * in reverse order. Production refuses to start without transaction support
 * (see server.js), so this fallback is never used there.
 *
 * @template T
 * @param {(ctx: { session: mongoose.ClientSession|null, onRollback: (fn: () => Promise<unknown>) => void }) => Promise<T>} work
 * @returns {Promise<T>}
 */
export const runAtomic = async (work) => {
  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await work({ session, onRollback: () => {} });
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  if (env.isProduction) {
    throw new Error('MongoDB transactions are required in production');
  }

  const compensations = [];
  try {
    return await work({ session: null, onRollback: (fn) => compensations.push(fn) });
  } catch (err) {
    for (const compensate of compensations.reverse()) {
      try {
        await compensate();
      } catch (rollbackErr) {
        logger.error({ err: rollbackErr }, 'Compensating rollback step failed');
      }
    }
    throw err;
  }
};
