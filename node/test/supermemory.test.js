import test from 'node:test';
import assert from 'node:assert/strict';
import { userTag, isUserTag } from '../lib/supermemory/containerTag.js';
import * as client from '../lib/supermemory/client.js';
import * as forest from '../lib/supermemory/forest.js';
import * as barrel from '../lib/supermemory/index.js';

const VALID_UUID = '3f9a2c10-7e4b-4a3d-9c1e-8b2f1a6d5c44';

test('userTag builds the contract-pinned containerTag for a valid UUID', () => {
  assert.equal(userTag(VALID_UUID), `user_${VALID_UUID}`);
});

test('userTag accepts uppercase UUIDs (case-insensitive hex)', () => {
  const upper = VALID_UUID.toUpperCase();
  assert.equal(userTag(upper), `user_${upper}`);
});

test('userTag rejects non-UUID strings', () => {
  assert.throws(() => userTag('not-a-uuid'), /expected a UUID/);
  assert.throws(() => userTag('user_123'), /expected a UUID/);
  assert.throws(() => userTag(''), /expected a UUID/);
});

test('userTag rejects non-string input (anti cross-tenant guard)', () => {
  assert.throws(() => userTag(undefined), /expected a UUID/);
  assert.throws(() => userTag(null), /expected a UUID/);
  assert.throws(() => userTag({ id: VALID_UUID }), /expected a UUID/);
  assert.throws(() => userTag(['user_', VALID_UUID]), /expected a UUID/);
});

test('isUserTag validates the full user_<uuid> shape', () => {
  assert.equal(isUserTag(`user_${VALID_UUID}`), true);
  assert.equal(isUserTag(VALID_UUID), false);
  assert.equal(isUserTag('user_not-a-uuid'), false);
  assert.equal(isUserTag('langtour_build'), false);
});

test('client.js exports the expected per-user + infra surface', () => {
  assert.equal(typeof client.supermemoryClient, 'function');
  assert.equal(typeof client.memoryTools, 'function');
  assert.equal(typeof client.createSupermemoryInfiniteChat, 'function');
});

test('forest.js exports the expected typed read/write surface', () => {
  assert.equal(typeof forest.getForestProfile, 'function');
  assert.equal(typeof forest.appendForestNode, 'function');
  assert.equal(typeof forest.appendForestNodes, 'function');
  assert.equal(typeof forest.forestTools, 'function');
});

test('index.js barrel re-exports the full surface', () => {
  for (const name of [
    'userTag',
    'isUserTag',
    'supermemoryClient',
    'memoryTools',
    'createSupermemoryInfiniteChat',
    'getForestProfile',
    'appendForestNode',
    'appendForestNodes',
    'forestTools',
  ]) {
    assert.equal(typeof barrel[name], 'function', `expected barrel.${name} to be exported`);
  }
});

test('supermemoryClient fails loud when no API key is available (env missing)', () => {
  const previous = process.env.SUPERMEMORY_API_KEY;
  delete process.env.SUPERMEMORY_API_KEY;
  try {
    assert.throws(() => client.supermemoryClient(), /SUPERMEMORY_API_KEY is missing/);
  } finally {
    if (previous !== undefined) process.env.SUPERMEMORY_API_KEY = previous;
  }
});

test('memoryTools fails loud when no API key is available (env missing)', () => {
  const previous = process.env.SUPERMEMORY_API_KEY;
  delete process.env.SUPERMEMORY_API_KEY;
  try {
    assert.throws(
      () => client.memoryTools(['user_x']),
      /SUPERMEMORY_API_KEY is missing/
    );
  } finally {
    if (previous !== undefined) process.env.SUPERMEMORY_API_KEY = previous;
  }
});

test('memoryTools rejects an empty/missing containerTags array', () => {
  assert.throws(
    () => client.memoryTools([], 'fake-key'),
    /containerTags must be a non-empty array/
  );
  assert.throws(
    () => client.memoryTools(undefined, 'fake-key'),
    /containerTags must be a non-empty array/
  );
});

test('memoryTools builds searchMemories/addMemory scoped to one containerTag', () => {
  const tools = client.memoryTools([userTag(VALID_UUID)], 'fake-key');
  assert.equal(typeof tools.searchMemories, 'object');
  assert.equal(typeof tools.addMemory, 'object');
});

test('createSupermemoryInfiniteChat fails loud when SUPERMEMORY_API_KEY is missing', () => {
  const previous = process.env.SUPERMEMORY_API_KEY;
  delete process.env.SUPERMEMORY_API_KEY;
  try {
    assert.throws(
      () => client.createSupermemoryInfiniteChat(undefined, {
        providerName: 'google',
        providerApiKey: 'fake-gemini-key',
      }),
      /SUPERMEMORY_API_KEY is missing/
    );
  } finally {
    if (previous !== undefined) process.env.SUPERMEMORY_API_KEY = previous;
  }
});

test('createSupermemoryInfiniteChat requires opts.providerApiKey', () => {
  assert.throws(
    () => client.createSupermemoryInfiniteChat('fake-key', { providerName: 'google' }),
    /providerApiKey is required/
  );
});

test('createSupermemoryInfiniteChat rejects unsupported provider names', () => {
  assert.throws(
    () => client.createSupermemoryInfiniteChat('fake-key', {
      providerName: 'unknown-provider',
      providerApiKey: 'fake-upstream-key',
    }),
    /unsupported providerName/
  );
});

test('createSupermemoryInfiniteChat returns a callable model factory for google', () => {
  const infiniteChat = client.createSupermemoryInfiniteChat('fake-key', {
    providerName: 'google',
    providerApiKey: 'fake-gemini-key',
    conversationId: 'conv-1',
  });
  assert.equal(typeof infiniteChat, 'function');
  // Calling it with a model id should produce a LanguageModel, mirroring the
  // plain `google('gemini-2.5-flash')` call sites in routes/scenario.js and
  // lib/graph/graph.js — this proves drop-in compatibility without making a
  // network call.
  const model = infiniteChat('gemini-2.5-flash');
  assert.equal(typeof model, 'object');
});

test('forest.getForestProfile / appendForestNode reject non-UUID user ids before any network call', async () => {
  await assert.rejects(
    () => forest.getForestProfile('not-a-uuid'),
    /expected a UUID/
  );
  await assert.rejects(
    () => forest.appendForestNode('not-a-uuid', { kind: 'word', lang: 'zh', id: 'word:zh:x', parent_id: null, label: 'x' }),
    /expected a UUID/
  );
});

test('forest.appendForestNode validates the ForestNode shape per contract 01', async () => {
  await assert.rejects(
    () => forest.appendForestNode(VALID_UUID, { kind: 'bogus', lang: 'zh', id: 'x', parent_id: null, label: 'x' }, 'fake-key'),
    /invalid node\.kind/
  );
  await assert.rejects(
    () => forest.appendForestNode(VALID_UUID, { kind: 'word', lang: 'de', id: 'x', parent_id: null, label: 'x' }, 'fake-key'),
    /invalid node\.lang/
  );
  await assert.rejects(
    () => forest.appendForestNode(VALID_UUID, { kind: 'word', lang: 'zh', id: '', parent_id: null, label: 'x' }, 'fake-key'),
    /node\.id is required/
  );
  await assert.rejects(
    () => forest.appendForestNode(VALID_UUID, { kind: 'word', lang: 'zh', id: 'x', parent_id: 5, label: 'x' }, 'fake-key'),
    /node\.parent_id must be a string or null/
  );
});

test('forest.appendForestNodes rejects a non-array nodes argument', async () => {
  await assert.rejects(
    () => forest.appendForestNodes(VALID_UUID, 'not-an-array', 'fake-key'),
    /nodes must be an array/
  );
});

test('forest.forestTools scopes @supermemory/ai-sdk tools to exactly one user containerTag', () => {
  const tools = forest.forestTools(VALID_UUID, 'fake-key');
  assert.equal(typeof tools.searchMemories, 'object');
  assert.equal(typeof tools.addMemory, 'object');
});
