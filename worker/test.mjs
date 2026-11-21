import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './src/index.js';

test('returns structured answer and removes parking IDs not present in app context', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(_url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(request.model, 'test-model');
    assert.equal(request.response_format.mime_type, 'application/json');
    return new Response(JSON.stringify({
      status: 'completed',
      steps: [{
        type: 'model_output',
        content: [{ type: 'text', text: JSON.stringify({
          answer: 'Plassen i Storgata er nærmest.',
          parkingIds: ['valid-place', 'invented-place'],
          confidence: 'high'
        }) }]
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await worker.fetch(new Request('https://worker.test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'Hvor er nærmeste parkering?',
        parking: [{ id: 'valid-place', name: 'Storgata', distanceMeters: 120 }]
      })
    }), { GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'test-model' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.parkingIds, ['valid-place']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects requests without a question before calling Gemini', async () => {
  const response = await worker.fetch(new Request('https://worker.test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: '' })
  }), { GEMINI_API_KEY: 'test-key' });
  assert.equal(response.status, 400);
});

test('uses the fallback model after a temporary error', async () => {
  const originalFetch = globalThis.fetch;
  const models = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    models.push(request.model);
    if (models.length < 2) {
      return new Response(JSON.stringify({ error: { message: 'High demand' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      steps: [{
        type: 'model_output',
        content: [{ type: 'text', text: JSON.stringify({ answer: 'Reserve-modellen svarte.', parkingIds: [], confidence: 'high' }) }]
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await worker.fetch(new Request('https://worker.test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Hei' })
    }), {
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'primary-model',
      GEMINI_FALLBACK_MODEL: 'fallback-model'
    });
    assert.equal(response.status, 200);
    assert.deepEqual(models, ['primary-model', 'fallback-model']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
