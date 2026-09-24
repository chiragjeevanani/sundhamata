/**
 * Starts a local single-node MongoDB replica set for development, so the API
 * runs with real multi-document transactions (like production / Atlas).
 *
 *   npm run db:dev
 *   MONGODB_URI=mongodb://127.0.0.1:27018/sundhamata?replicaSet=rs0
 *
 * Uses MONGOD_PATH, or `mongod` on PATH, or the default Windows install location.
 * Data lives in backend/.data/db (git-ignored). Ctrl+C stops it.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const { MongoClient } = mongoose.mongo;

const PORT = Number(process.env.DEV_MONGO_PORT || 27018);
const REPLICA_SET = 'rs0';
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.data', 'db');

const findMongod = () => {
  if (process.env.MONGOD_PATH) return process.env.MONGOD_PATH;
  if (process.platform === 'win32') {
    const root = 'C:\\Program Files\\MongoDB\\Server';
    if (fs.existsSync(root)) {
      const version = fs.readdirSync(root).sort().reverse().find((v) => fs.existsSync(path.join(root, v, 'bin', 'mongod.exe')));
      if (version) return path.join(root, version, 'bin', 'mongod.exe');
    }
  }
  return 'mongod';
};

const waitForServer = async (uri, attempts = 40) => {
  for (let i = 0; i < attempts; i += 1) {
    const client = new MongoClient(uri, { directConnection: true, serverSelectionTimeoutMS: 500 });
    try {
      await client.connect();
      return client;
    } catch {
      await client.close().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`mongod did not start on port ${PORT}`);
};

fs.mkdirSync(dataDir, { recursive: true });
const mongod = spawn(
  findMongod(),
  ['--replSet', REPLICA_SET, '--port', String(PORT), '--bind_ip', '127.0.0.1', '--dbpath', dataDir, '--quiet'],
  { stdio: ['ignore', 'ignore', 'inherit'] }
);
mongod.on('exit', (code) => {
  console.error(`mongod exited with code ${code}`);
  process.exit(code ?? 1);
});
mongod.on('error', (err) => {
  console.error(`Could not start mongod (${err.message}). Set MONGOD_PATH to your mongod binary.`);
  process.exit(1);
});

const client = await waitForServer(`mongodb://127.0.0.1:${PORT}`);
try {
  await client.db('admin').command({ replSetGetStatus: 1 });
} catch {
  await client.db('admin').command({
    replSetInitiate: { _id: REPLICA_SET, members: [{ _id: 0, host: `127.0.0.1:${PORT}` }] },
  });
}
await client.close();

console.error(`MongoDB replica set "${REPLICA_SET}" ready.`);
console.error(`MONGODB_URI=mongodb://127.0.0.1:${PORT}/sundhamata?replicaSet=${REPLICA_SET}`);

const stop = () => mongod.kill('SIGINT');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
