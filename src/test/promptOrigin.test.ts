import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { classifyPromptTextOrigin } from '../promptOrigin';

test('prompt origin classifier separates framework structures without semantic guessing', () => {
  assert.equal(classifyPromptTextOrigin({ text: 'Fix the login bug' }), 'user-authored');
  assert.equal(classifyPromptTextOrigin({ text: '<div>user pasted HTML</div>' }), 'user-authored');
  assert.equal(classifyPromptTextOrigin({ text: 'anything', isMeta: true }), 'meta');
  assert.equal(classifyPromptTextOrigin({ text: 'anything', isSidechain: true }), 'sidechain');
  assert.equal(classifyPromptTextOrigin({ text: 'dispatch', isSubagentFile: true }), 'subagent-dispatch');
  assert.equal(
    classifyPromptTextOrigin({ text: '<command-name>/review</command-name>' }),
    'command-echo',
  );
  assert.equal(
    classifyPromptTextOrigin({ text: '<system-reminder>private framework text</system-reminder>' }),
    'system-reminder',
  );
  assert.equal(
    classifyPromptTextOrigin({ text: 'User-looking prefix <system-reminder>PRIVATE</system-reminder>' }),
    'system-reminder',
  );
  assert.equal(
    classifyPromptTextOrigin({ text: '<local-command-stdout>output</local-command-stdout>' }),
    'command-echo',
  );
  assert.equal(
    classifyPromptTextOrigin({ text: '<agent-context>injected</agent-context>' }),
    'user-authored',
  );
  assert.equal(
    classifyPromptTextOrigin({ text: '<my-component>user-authored markup</my-component>' }),
    'user-authored',
  );
});
