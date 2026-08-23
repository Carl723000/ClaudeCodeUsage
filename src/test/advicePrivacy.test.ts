import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { prepareAdvicePayload, previewAdvicePayload } from '../adviceEffectiveness/payload';
import { payloadInputFixture } from './adviceTestFixtures';

const SENTINELS = {
  prompt: 'PRIVATE_PROMPT_SENTINEL',
  response: 'PRIVATE_RESPONSE_SENTINEL',
  path: '/Users/private/repository',
  session: 'PRIVATE_SESSION_ID',
  credential: 'sk-ant-private-credential',
  username: 'private-user-name',
};

function hostileInput(includePrompt: boolean) {
  const input = payloadInputFixture() as ReturnType<typeof payloadInputFixture> & Record<string, unknown>;
  input.cwd = SENTINELS.path;
  input.sessionId = SENTINELS.session;
  input.apiKey = SENTINELS.credential;
  (input.aggregate as unknown as Record<string, unknown>).response = SENTINELS.response;
  (input.aggregate.totals as unknown as Record<string, unknown>).username = SENTINELS.username;
  (input.aggregate.modelFamilies[0] as unknown as Record<string, unknown>).model = 'private-custom-model';
  (input.sources[0] as unknown as Record<string, unknown>).repoPath = SENTINELS.path;
  (input.sources[0].window as unknown as Record<string, unknown>).rawSessionId = SENTINELS.session;
  (input.observations[0] as unknown as Record<string, unknown>).prompt = SENTINELS.prompt;
  (input.evidence[0] as unknown as Record<string, unknown>).response = SENTINELS.response;
  if (includePrompt) {
    input.promptSamples = {
      consent: 'explicit',
      samples: [
        {
          text: SENTINELS.prompt,
          cwd: SENTINELS.path,
          response: SENTINELS.response,
          apiKey: SENTINELS.credential,
        } as { text: string },
      ],
    };
  }
  return input;
}

test('aggregates-only serialization strips hostile raw content and identifying fields at every depth', () => {
  const prepared = prepareAdvicePayload(hostileInput(false));
  const preview = previewAdvicePayload(prepared);
  assert.equal(preview.body, prepared.serializedBody);
  for (const sentinel of Object.values(SENTINELS)) {
    assert.equal(prepared.serializedBody.includes(sentinel), false, `leaked sentinel: ${sentinel}`);
  }
  assert.doesNotMatch(
    prepared.serializedBody,
    /"(?:cwd|path|repoPath|sessionId|rawSessionId|username|apiKey|response|prompt)"/
  );
});

test('prompt opt-in permits only bounded prompt text and still strips cwd, response, and credentials', () => {
  const prepared = prepareAdvicePayload(hostileInput(true));
  assert.equal(prepared.serializedBody.includes(SENTINELS.prompt), true);
  for (const sentinel of [SENTINELS.path, SENTINELS.response, SENTINELS.credential, SENTINELS.session]) {
    assert.equal(prepared.serializedBody.includes(sentinel), false, `leaked non-consented sentinel: ${sentinel}`);
  }
  assert.doesNotMatch(prepared.serializedBody, /"(?:cwd|repoPath|sessionId|apiKey|response)"/);
});
