import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import AxeBuilder from '@axe-core/playwright';

import { test, expect, openClaude, openCodex } from './support/app.mjs';

const require = createRequire(import.meta.url);
const {
  PROMPT_SENTINEL,
  buildAdviceEffectivenessFixture,
} = require('./support/advice-effectiveness-fixture.cjs');

const locales = ['en', 'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id'];

async function openCandidate(page, provider, options = {}) {
  const open = provider === 'claude' ? openClaude : openCodex;
  await open(page, { ...options, fixture: 'advice-effectiveness' });
  await page.locator('#tab-content').click();
  const root = page.locator(
    `.advice-effectiveness-body[data-advice-provider="${provider}"]`,
  );
  await expect(root).toBeVisible();
  return root;
}

async function dispatchHostMessage(page, message) {
  await page.evaluate((data) => {
    window.dispatchEvent(new MessageEvent('message', { data }));
  }, message);
}

async function postedMessages(page, command) {
  return page.evaluate((expectedCommand) =>
    window.__ccuPostedMessages.filter((message) => message.command === expectedCommand),
  command);
}

async function expectPostedCount(page, command, count) {
  await expect.poll(async () => (await postedMessages(page, command)).length).toBe(count);
}

async function grantAggregateConsent(page) {
  const aggregate = page.locator(
    '[data-advice-provider="claude"] [data-advice-consent-kind="aggregate"]',
  );
  await aggregate.focus();
  await aggregate.press('Space');
  await expectPostedCount(page, 'updateAdviceConsent', 1);
  await dispatchHostMessage(page, {
    command: 'adviceConsentResult',
    ok: true,
    provider: 'claude',
    aggregateConsent: 'explicit',
    promptSampleConsent: 'not-granted',
  });
  await expect(aggregate).toBeChecked();
}

async function seriousOrCriticalViolations(page, include) {
  const builder = new AxeBuilder({ page });
  if (include) builder.include(include);
  const results = await builder.analyze();
  const violations = [];
  for (const violation of results.violations
    .filter((item) => item.impact === 'serious' || item.impact === 'critical')) {
    const targets = [];
    for (const node of violation.nodes) {
      const contrast = node.any.map((check) => check.data).find((data) => data?.contrastRatio);
      const themedAccent = violation.id === 'color-contrast' && contrast
        ? await page.evaluate((target) => {
          const element = document.querySelector(target.join(' '));
          if (!element) return null;
          const style = getComputedStyle(element);
          const probe = document.createElement('span');
          document.body.appendChild(probe);
          const resolve = (value) => {
            probe.style.color = value;
            return getComputedStyle(probe).color;
          };
          const root = getComputedStyle(document.documentElement);
          const accentTokens = [
            '--vscode-charts-blue', '--vscode-charts-green', '--vscode-charts-orange',
            '--vscode-charts-purple', '--vscode-charts-red', '--vscode-charts-yellow',
            '--vscode-focusBorder',
          ];
          const isAccent = accentTokens.some((token) =>
            resolve(root.getPropertyValue(token).trim()) === style.color);
          probe.remove();
          const weight = Number.parseInt(style.fontWeight, 10) || 400;
          const hasUnderline = style.textDecorationLine !== 'none'
            || (Number.parseFloat(style.borderBottomWidth) >= 2 && style.borderBottomStyle !== 'none');
          const before = getComputedStyle(element, '::before').content;
          const after = getComputedStyle(element, '::after').content;
          const hasIcon = (before && before !== 'none' && before !== 'normal')
            || (after && after !== 'none' && after !== 'normal')
            || Boolean(element.querySelector('svg, .codicon, [aria-hidden="true"]'));
          return { isAccent, hasNonColorCue: weight >= 600 || hasUnderline || hasIcon };
        }, node.target)
        : null;
      if (!themedAccent?.isAccent
        || Number(contrast.contrastRatio) < 3
        || !themedAccent.hasNonColorCue) {
        targets.push(node.target);
      }
    }
    if (targets.length) violations.push({
      id: violation.id,
      impact: violation.impact,
      targets,
    });
  }
  return violations;
}

test('candidate surface is absent from the default-off fixture', async ({ page }) => {
  await openClaude(page, { fixture: 'advice-effectiveness-disabled' });
  await page.locator('#tab-content').click();
  await expect(page.locator('.advice-effectiveness-body')).toHaveCount(0);

  await openCodex(page, { fixture: 'advice-effectiveness-disabled' });
  await page.locator('#tab-content').click();
  await expect(page.locator('.advice-effectiveness-body')).toHaveCount(0);
});

test('candidate extends the existing provider card instead of creating a third card', async ({ page }) => {
  const claudeRoot = await openCandidate(page, 'claude');
  const claudeCards = page.locator('#content > .action-card');
  await expect(claudeCards).toHaveCount(2);
  await expect(claudeCards.first().locator('[data-advice-provider="claude"]')).toHaveCount(1);
  await expect(claudeCards.nth(1).locator('.advice-effectiveness-body')).toHaveCount(0);
  expect(await claudeRoot.evaluate((element) =>
    element.parentElement?.classList.contains('action-card'))).toBe(true);

  const codexRoot = await openCandidate(page, 'codex');
  const codexCards = page.locator('#content > .action-card');
  await expect(codexCards).toHaveCount(1);
  await expect(codexCards.first().locator('[data-advice-provider="codex"]')).toHaveCount(1);
  expect(await codexRoot.evaluate((element) =>
    element.parentElement?.classList.contains('action-card'))).toBe(true);
});

test('aggregate and prompt consent remain separate and prompt starts closed', async ({ page }) => {
  const root = await openCandidate(page, 'claude');
  const aggregate = root.locator('[data-advice-consent-kind="aggregate"]');
  const prompt = root.locator('[data-advice-consent-kind="prompt"]');
  const preview = root.locator('[data-advice-action="preview"]');

  await expect(aggregate).not.toBeChecked();
  await expect(aggregate).toBeEnabled();
  await expect(prompt).not.toBeChecked();
  await expect(prompt).toBeDisabled();
  await expect(preview).toBeDisabled();
  expect(await page.content()).not.toContain(PROMPT_SENTINEL);

  await aggregate.focus();
  await aggregate.press('Space');
  await expectPostedCount(page, 'updateAdviceConsent', 1);
  expect((await postedMessages(page, 'updateAdviceConsent')).at(-1)).toEqual({
    command: 'updateAdviceConsent',
    provider: 'claude',
    aggregateConsent: 'explicit',
    promptSampleConsent: 'not-granted',
  });
  await dispatchHostMessage(page, {
    command: 'adviceConsentResult',
    ok: true,
    provider: 'claude',
    aggregateConsent: 'explicit',
    promptSampleConsent: 'not-granted',
  });

  await expect(aggregate).toBeChecked();
  await expect(prompt).toBeEnabled();
  await expect(prompt).not.toBeChecked();
  await expect(preview).toBeEnabled();

  await prompt.focus();
  await prompt.press('Space');
  await expectPostedCount(page, 'updateAdviceConsent', 2);
  expect((await postedMessages(page, 'updateAdviceConsent')).at(-1)).toEqual({
    command: 'updateAdviceConsent',
    provider: 'claude',
    aggregateConsent: 'explicit',
    promptSampleConsent: 'explicit',
  });
  expect(await page.content()).not.toContain(PROMPT_SENTINEL);
  await dispatchHostMessage(page, {
    command: 'adviceConsentResult',
    ok: true,
    provider: 'claude',
    aggregateConsent: 'explicit',
    promptSampleConsent: 'explicit',
  });
  await expect(prompt).toBeChecked();

  await aggregate.focus();
  await aggregate.press('Space');
  await expectPostedCount(page, 'updateAdviceConsent', 3);
  expect((await postedMessages(page, 'updateAdviceConsent')).at(-1)).toEqual({
    command: 'updateAdviceConsent',
    provider: 'claude',
    aggregateConsent: 'not-granted',
    promptSampleConsent: 'not-granted',
  });
});

test('sealed preview renders the exact canonical body, UTF-8 size, and SHA-256', async ({ page }) => {
  const fixture = buildAdviceEffectivenessFixture({ locale: 'en' });
  const networkAfterLoad = [];
  await openCandidate(page, 'claude');
  page.on('request', (request) => networkAfterLoad.push(request.url()));
  await grantAggregateConsent(page);

  const previewButton = page.locator(
    '[data-advice-provider="claude"] [data-advice-action="preview"]',
  );
  await previewButton.focus();
  await previewButton.press('Enter');
  await expectPostedCount(page, 'prepareAdviceSnapshot', 1);
  expect((await postedMessages(page, 'prepareAdviceSnapshot')).at(-1)).toEqual({
    command: 'prepareAdviceSnapshot',
    provider: 'claude',
    aggregateConsent: 'explicit',
    promptSampleConsent: 'not-granted',
  });
  await dispatchHostMessage(page, fixture.snapshotMessages.aggregateOnly);

  const preview = page.locator('[data-advice-preview="claude"]');
  const body = preview.locator('[data-advice-preview-body]');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute(
    'data-snapshot-id',
    fixture.snapshotMessages.aggregateOnly.snapshotId,
  );
  await expect(body).toHaveText(fixture.snapshotMessages.aggregateOnly.body);
  await expect(preview.locator('[data-advice-preview-bytes]')).toContainText(
    String(fixture.snapshotMessages.aggregateOnly.utf8Bytes),
  );
  await expect(preview.locator('[data-advice-preview-count]')).toContainText('0');
  await expect(preview.locator('[data-advice-preview-digest]')).toHaveText(
    `SHA-256 ${fixture.snapshotMessages.aggregateOnly.sha256}`,
  );
  expect(Buffer.byteLength(fixture.snapshotMessages.aggregateOnly.body, 'utf8')).toBe(
    fixture.snapshotMessages.aggregateOnly.utf8Bytes,
  );
  expect(createHash('sha256')
    .update(fixture.snapshotMessages.aggregateOnly.body, 'utf8')
    .digest('hex')).toBe(fixture.snapshotMessages.aggregateOnly.sha256);
  expect(fixture.snapshotMessages.aggregateOnly.body).not.toContain('promptSamples');
  expect(await page.content()).not.toContain(PROMPT_SENTINEL);

  const prompt = page.locator(
    '[data-advice-provider="claude"] [data-advice-consent-kind="prompt"]',
  );
  await prompt.focus();
  await prompt.press('Space');
  await expectPostedCount(page, 'updateAdviceConsent', 2);
  await dispatchHostMessage(page, {
    command: 'adviceConsentResult',
    ok: true,
    provider: 'claude',
    aggregateConsent: 'explicit',
    promptSampleConsent: 'explicit',
  });
  expect(await page.content()).not.toContain(PROMPT_SENTINEL);

  await previewButton.focus();
  await previewButton.press('Enter');
  await expectPostedCount(page, 'prepareAdviceSnapshot', 2);
  expect((await postedMessages(page, 'prepareAdviceSnapshot')).at(-1)).toEqual({
    command: 'prepareAdviceSnapshot',
    provider: 'claude',
    aggregateConsent: 'explicit',
    promptSampleConsent: 'explicit',
  });
  await dispatchHostMessage(page, fixture.snapshotMessages.withPromptSamples);
  await expect(body).toHaveText(fixture.snapshotMessages.withPromptSamples.body);
  await expect(body).toContainText(PROMPT_SENTINEL);
  await expect(preview.locator('[data-advice-preview-bytes]')).toContainText(
    String(fixture.snapshotMessages.withPromptSamples.utf8Bytes),
  );
  await expect(preview.locator('[data-advice-preview-count]')).toContainText('1');
  await expect(preview.locator('[data-advice-preview-digest]')).toHaveText(
    `SHA-256 ${fixture.snapshotMessages.withPromptSamples.sha256}`,
  );
  expect(Buffer.byteLength(fixture.snapshotMessages.withPromptSamples.body, 'utf8')).toBe(
    fixture.snapshotMessages.withPromptSamples.utf8Bytes,
  );
  expect(createHash('sha256')
    .update(fixture.snapshotMessages.withPromptSamples.body, 'utf8')
    .digest('hex')).toBe(fixture.snapshotMessages.withPromptSamples.sha256);
  expect(networkAfterLoad).toEqual([]);
});

test('candidate exposes no send control and feedback posts identifiers plus kind only', async ({ page }) => {
  const root = await openCandidate(page, 'claude');
  await expect(root.locator('form, a[href]')).toHaveCount(0);
  await expect(root.getByRole('button', { name: /send|upload|submit|transmit/i })).toHaveCount(0);
  expect(await root.locator('[data-advice-action]').evaluateAll((elements) =>
    [...new Set(elements.map((element) => element.getAttribute('data-advice-action')))].sort()))
    .toEqual(['feedback', 'preview']);

  const feedbackKinds = await root.locator('[data-advice-action="feedback"]')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-feedback-kind')));
  expect(feedbackKinds).toEqual(['helpful', 'not-helpful', 'applied']);

  const helpful = root.locator('[data-feedback-kind="helpful"]');
  await helpful.focus();
  await helpful.press('Space');
  await expectPostedCount(page, 'recordAdviceFeedback', 1);
  const message = (await postedMessages(page, 'recordAdviceFeedback')).at(-1);
  expect(Object.keys(message).sort()).toEqual([
    'adviceId',
    'command',
    'kind',
    'provider',
    'recommendationId',
  ]);
  expect(message).toEqual({
    command: 'recordAdviceFeedback',
    provider: 'claude',
    adviceId: 'advice-claude-ui-fixture',
    recommendationId: 'recommendation-claude-clear-between-tasks',
    kind: 'helpful',
  });
  expect(JSON.stringify(message)).not.toMatch(/prompt|body|path|session|payload/i);

  await dispatchHostMessage(page, {
    command: 'adviceFeedbackResult',
    ok: true,
    provider: 'claude',
    adviceId: message.adviceId,
    recommendationId: message.recommendationId,
    rating: 'helpful',
    applied: 'not-applied',
  });
  await expect(helpful).toHaveAttribute('aria-pressed', 'true');
  await expect(helpful).toBeEnabled();
  await expect(root.locator('[data-advice-feedback-status]')).not.toBeEmpty();
});

for (const provider of ['claude', 'codex']) {
  test(`${provider} candidate has labelled structure and no serious Axe violations`, async ({ page }) => {
    const root = await openCandidate(page, provider, { theme: 'dark' });
    await expect(root).toHaveAttribute('aria-labelledby', `advice-effectiveness-${provider}`);
    await expect(root.locator(`#advice-effectiveness-${provider}`)).toBeVisible();
    await expect(root.locator('.advice-spine')).toHaveAttribute('aria-label', /.+/);
    await expect(root.locator('.advice-spine > li')).toHaveCount(5);
    await expect(root.locator('.advice-step-marker')).toHaveText(['1', '2', '3', '4', '5']);
    await expect(root.locator('.advice-feedback-group')).toHaveAttribute('role', 'group');
    await expect(root.locator('[data-advice-feedback-status]')).toHaveAttribute('aria-live', 'polite');
    if (provider === 'claude') {
      await expect(root.locator('.advice-consent legend')).not.toBeEmpty();
      await expect(root.locator('[data-advice-consent-status]')).toHaveAttribute('aria-live', 'polite');
      await expect(root.locator('[data-advice-preview-body]')).toHaveAttribute('tabindex', '0');
      await expect(root.locator('[data-advice-preview-body]')).toHaveAttribute('aria-label', /.+/);
    }
    expect(await seriousOrCriticalViolations(
      page,
      `.advice-effectiveness-body[data-advice-provider="${provider}"]`,
    )).toEqual([]);
  });
}

for (const locale of locales) {
  test(`${locale} candidate adds no narrow-screen overflow beyond the shared shell`, async ({ page }) => {
    for (const provider of ['claude', 'codex']) {
      const open = provider === 'claude' ? openClaude : openCodex;
      await open(page, {
        fixture: 'advice-effectiveness-disabled',
        locale,
        width: 360,
        height: 800,
      });
      await page.locator('#tab-content').click();
      const baseline = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));

      const root = await openCandidate(page, provider, {
        locale,
        width: 360,
        height: 800,
      });
      const layout = await root.evaluate((element) => ({
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        rootClientWidth: element.clientWidth,
        rootScrollWidth: element.scrollWidth,
      }));
      // The pre-existing tab/header shell is intentionally one unwrapped row
      // on narrow panels. The candidate must not widen that known baseline.
      expect(layout.documentWidth, { baseline, layout })
        .toBeLessThanOrEqual(baseline.documentWidth);
      expect(layout.bodyWidth, { baseline, layout })
        .toBeLessThanOrEqual(baseline.bodyWidth);
      expect(layout.rootScrollWidth, layout).toBeLessThanOrEqual(layout.rootClientWidth);
    }
  });
}

for (const theme of ['light', 'dark']) {
  test(`${theme} candidate keeps the sealed-snapshot visual hierarchy`, async ({ page }) => {
    const root = await openCandidate(page, 'claude', { theme });
    const structure = await root.evaluate((element) => {
      const style = getComputedStyle(element);
      const spine = element.querySelector('.advice-spine');
      const payload = element.querySelector('.advice-payload-section');
      return {
        background: style.backgroundColor,
        borderStyle: style.borderTopStyle,
        borderWidth: Number.parseFloat(style.borderTopWidth),
        spineDisplay: spine ? getComputedStyle(spine).display : null,
        payloadBorderStyle: payload ? getComputedStyle(payload).borderTopStyle : null,
        payloadBorderWidth: payload ? Number.parseFloat(getComputedStyle(payload).borderTopWidth) : 0,
      };
    });
    expect(structure.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(structure.borderStyle).not.toBe('none');
    expect(structure.borderWidth).toBeGreaterThan(0);
    expect(structure.spineDisplay).toBe('grid');
    expect(structure.payloadBorderStyle).not.toBe('none');
    expect(structure.payloadBorderWidth).toBeGreaterThan(0);
  });
}
