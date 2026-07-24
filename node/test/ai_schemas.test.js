import test from 'node:test';
import assert from 'node:assert/strict';
import { turnSchema } from '../lib/ai/prompts/generate_turn.js';
import { evaluationSchema } from '../lib/ai/prompts/evaluate_response.js';

// Cerebras' strict json_schema mode 400s ("'additionalProperties' is
// required to be supplied and set to false") unless every object node in
// the schema carries `additionalProperties: false`. Walk the raw JSON
// Schema tree and assert that's true everywhere, so a new nested object
// added later can't silently reintroduce the prod bug.
function objectNodes(node, path = '$') {
  if (!node || typeof node !== 'object') return [];
  const nodes = node.type === 'object' ? [{ node, path }] : [];
  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties)) {
      nodes.push(...objectNodes(child, `${path}.properties.${key}`));
    }
  }
  if (node.items) nodes.push(...objectNodes(node.items, `${path}.items`));
  return nodes;
}

for (const [name, schema] of [
  ['turnSchema', turnSchema],
  ['evaluationSchema', evaluationSchema],
]) {
  test(`${name}: every object node sets additionalProperties: false`, () => {
    const raw = schema.jsonSchema;
    const nodes = objectNodes(raw);
    assert.ok(nodes.length > 0, 'schema has at least one object node to check');
    for (const { node, path } of nodes) {
      assert.equal(node.additionalProperties, false, `${path} must set additionalProperties: false`);
    }
  });
}

test('turnSchema: top-level and nested newWord object both carry the flag', () => {
  const raw = turnSchema.jsonSchema;
  assert.equal(raw.additionalProperties, false);
  assert.equal(raw.properties.newWord.additionalProperties, false);
});

test('evaluationSchema: top-level object carries the flag; usedExpressions array is untouched', () => {
  const raw = evaluationSchema.jsonSchema;
  assert.equal(raw.additionalProperties, false);
  assert.equal(raw.properties.usedExpressions.type, 'array');
  assert.equal(raw.properties.usedExpressions.additionalProperties, undefined);
});
