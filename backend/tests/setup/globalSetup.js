import fs from 'node:fs';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// Prefer a locally installed mongod (avoids a large download); otherwise
// mongodb-memory-server downloads a binary on first run.
const detectSystemMongod = () => {
  if (process.env.MONGOMS_SYSTEM_BINARY) return;
  const candidates = [];
  if (process.platform === 'win32') {
    const root = 'C:\\Program Files\\MongoDB\\Server';
    if (fs.existsSync(root)) {
      for (const version of fs.readdirSync(root).sort().reverse()) {
        candidates.push(path.join(root, version, 'bin', 'mongod.exe'));
      }
    }
  } else {
    candidates.push('/usr/bin/mongod', '/usr/local/bin/mongod', '/opt/homebrew/bin/mongod');
  }
  const found = candidates.find((file) => fs.existsSync(file));
  if (found) process.env.MONGOMS_SYSTEM_BINARY = found;
};

let replSet;

export async function setup({ provide }) {
  detectSystemMongod();
  // A replica set (not a standalone) so MongoDB transactions are really exercised.
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  provide('mongoUri', replSet.getUri());
}

export async function teardown() {
  await replSet?.stop();
}
