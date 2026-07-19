import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = resolve(__dirname, '..', '..');

function repoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

function activePatterns(relativePath: string): Set<string> {
  return new Set(
    repoFile(relativePath)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#')),
  );
}

test('AGENTS is the canonical Codex repository policy', () => {
  const agents = repoFile('AGENTS.md');
  assert.match(agents, /Codex Beta in v2\.3\.0/);
  assert.match(agents, /2\.4-GB-class history.*worker/is);
  assert.match(agents, /no new runtime dependencies/i);
  assert.match(agents, /all eight UI locales/i);
  assert.match(agents, /push, open a pull request, merge, or publish a release/i);
  assert.match(agents, /Generated with \[OpenAI Codex\]/);
  assert.match(agents, /Co-authored-by: OpenAI Codex <215057067\+openai-codex\[bot\]@users\.noreply\.github\.com>/);
});

test('AGENTS links a faithful Simplified-Chinese review copy', () => {
  const agents = repoFile('AGENTS.md');
  const chinese = repoFile('AGENTS.zh-CN.md');
  assert.match(agents, /AGENTS\.zh-CN\.md/);
  assert.match(chinese, /v2\.3\.0.*Codex Beta/);
  assert.match(chinese, /主要撰写.*OpenAI Codex.*Co-authored-by/is);
  assert.match(chinese, /中文链接排在英文链接之前/);
  assert.match(chinese, /推送、创建 PR、合并或发布 Release/);
});

test('contributor pull requests retain their merged attribution', () => {
  const agents = repoFile('AGENTS.md');
  const chinese = repoFile('AGENTS.zh-CN.md');
  assert.match(agents, /Never copy.*contributor pull request.*close.*superseded/is);
  assert.match(agents, /merge the\s+contributor's original pull request/i);
  assert.match(agents, /needs revision.*original PR branch.*then merge/is);
  assert.match(agents, /Close.*without merging.*only.*no\s+meaningful contribution.*empty.*spam.*irrelevant/is);
  assert.match(chinese, /严禁.*贡献者 PR.*吸收.*关闭/is);
  assert.match(chinese, /合并贡献者的原始 PR/);
  assert.match(chinese, /不够合理.*原 PR 分支.*修改后合并/is);
  assert.match(chinese, /不合并而关闭.*无可保留价值.*空 PR.*spam.*无关/is);
});

test('CLAUDE is a compatibility entry point, not a conflicting policy source', () => {
  const claude = repoFile('CLAUDE.md');
  assert.match(claude, /AGENTS\.md.*canonical repository policy/);
  assert.match(claude, /polling always follows\s+`refreshInterval`/);
  assert.doesNotMatch(claude, /activity-aware: ~15 s|never writes to `~\/\.claude\/`/);
});

test('line endings and tracked file modes are repository-safe', () => {
  const attributes = repoFile('.gitattributes');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  for (const binary of ['*.png binary', '*.jpg binary', '*.jpeg binary', '*.gif binary', '*.webp binary', '*.ico binary', '*.vsix binary']) {
    assert.match(attributes, new RegExp(`^${binary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }

  const badModes = execFileSync('git', ['ls-files', '--stage'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((line) => !line.startsWith('100644 '));
  assert.deepEqual(badModes, []);
});

test('git and VSIX ignores exclude private and development-only material', () => {
  const gitIgnore = activePatterns('.gitignore');
  for (const pattern of ['out', 'node_modules', '*.vsix', '.env', '.env.*', 'secrets.json', 'CLAUDE.local.md', 'docs/', '.claude/', '.agents/', '.codex/', '.worktrees/']) {
    assert.ok(gitIgnore.has(pattern), `.gitignore missing ${pattern}`);
  }

  const vscodeIgnore = activePatterns('.vscodeignore');
  for (const pattern of ['.github/**', 'src/**', 'out/test/**', 'AGENTS.md', 'AGENTS.zh-CN.md', 'CLAUDE.md', 'CLAUDE.local.md', 'CONTRIBUTING.md', 'docs/**', '.claude/**', '.agents/**', '.codex/**', '.worktrees/**', '.env', '**/.env', '**/.env.*', '**/secrets.json', '**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx']) {
    assert.ok(vscodeIgnore.has(pattern), `.vscodeignore missing ${pattern}`);
  }
});

test('all seven README files credit both development tools', () => {
  const readmes = [
    'README.md',
    'README-en.md',
    'README-zh-CN.md',
    'README-zh-TW.md',
    'README-ja.md',
    'README-ko.md',
    'README-id.md',
  ];
  for (const readme of readmes) {
    const body = repoFile(readme);
    assert.match(body, /https:\/\/claude\.com\/claude-code/, `${readme} missing Claude Code credit`);
    assert.match(body, /https:\/\/developers\.openai\.com\/codex\//, `${readme} missing OpenAI Codex credit`);
  }
});

test('all seven README editions explain Codex Beta in their own language', () => {
  const expectations: Record<string, RegExp[]> = {
    'README.md': [/Codex Beta/, /processed/i, /fresh/i, /cached/i, /last-observed/i],
    'README-en.md': [/Codex Beta/, /processed/i, /fresh/i, /cached/i, /last-observed/i],
    'README-zh-CN.md': [/Codex Beta/, /已处理/, /新鲜/, /缓存/, /最后观测/],
    'README-zh-TW.md': [/Codex Beta/, /已處理/, /新鮮/, /快取/, /最後觀測/],
    'README-ja.md': [/Codex Beta/, /処理済み/, /新規入力/, /キャッシュ/, /最終観測/],
    'README-ko.md': [/Codex Beta/, /처리된/, /새 입력/, /캐시/, /마지막 관측/],
    'README-id.md': [/Codex Beta/, /diproses/i, /baru/i, /cache/i, /terakhir diamati/i],
  };

  for (const [readme, patterns] of Object.entries(expectations)) {
    const body = repoFile(readme);
    for (const pattern of patterns) {
      assert.match(body, pattern, `${readme} is missing ${pattern}`);
    }
    assert.doesNotMatch(body, /showOpusWeekly/, `${readme} still documents the retired setting key`);
  }
});

test('Marketplace metadata presents Claude and Codex local usage support', () => {
  const packageJson = JSON.parse(repoFile('package.json')) as {
    description: string;
    keywords: string[];
  };
  assert.match(packageJson.description, /Claude.*Codex|Codex.*Claude/i);
  assert.ok(packageJson.keywords.includes('codex'));
  assert.ok(packageJson.keywords.includes('openai'));
  assert.ok(packageJson.keywords.includes('local-usage'));
});

test('pull request checklist names the actual eight UI locales', () => {
  const packageJson = JSON.parse(repoFile('package.json')) as {
    contributes: { configuration: { properties: Record<string, { enum?: string[] }> } };
  };
  const languageValues = packageJson.contributes.configuration.properties['claudeCodeUsage.language'].enum ?? [];
  assert.equal(languageValues.filter((value) => value !== 'auto').length, 8);

  const template = repoFile('.github/PULL_REQUEST_TEMPLATE.md');
  assert.match(template, /all eight UI locales/);
  assert.doesNotMatch(template, /all seven languages/);
  assert.match(template, /all seven README editions/);
});

test('changelog records the v2.3.0 candidate and released v2.2.1 baseline', () => {
  const changelog = repoFile('CHANGELOG.md');
  assert.match(changelog, /^## \[2\.3\.0\] — Unreleased$/m);
  assert.match(changelog, /^## \[2\.2\.1\] — 2026-07-18$/m);
  assert.match(changelog, /^## \[2\.2\.0\] — 2026-07-07$/m);
  assert.match(changelog, /OpenAI Codex/);
  assert.doesNotMatch(changelog, /^## \[2\.2\.[01]\] — Unreleased$/m);
});

test('release announcements are exact-version and user-disableable', () => {
  const extension = repoFile('src/extension.ts');
  const settings = repoFile('src/settings.ts');

  assert.match(extension, /'2\.3\.0'/);
  assert.doesNotMatch(extension, /'2\.2'\s*:/);
  assert.match(settings, /key:\s*'releaseAnnouncements'/);
  assert.match(settings, /default:\s*true/);
});

test('retired showOpusWeekly is absent from active product code', () => {
  for (const file of [
    'src/settings.ts',
    'src/types.ts',
    'src/extension.ts',
    'src/statusBar.ts',
    'src/quotaFormat.ts',
  ]) {
    assert.doesNotMatch(repoFile(file), /showOpusWeekly/, `${file} still exposes showOpusWeekly`);
  }
});

test('Codex beta settings use safe provider-aware defaults', () => {
  const settings = repoFile('src/settings.ts');
  const webview = repoFile('src/webview.ts');
  const packageJson = repoFile('package.json');

  assert.match(settings, /key:\s*'codex\.enabled'[\s\S]*?default:\s*true/);
  assert.match(settings, /key:\s*'codex\.fileWatchSeconds'[\s\S]*?default:\s*'30'/);
  assert.match(settings, /key:\s*'statusBarProvider'[\s\S]*?default:\s*'auto'/);
  assert.match(settings, /key:\s*'codex\.statusMetric'[\s\S]*?default:\s*'fresh'/);
  assert.match(webview, /'general'[\s\S]*?'providers'[\s\S]*?'features'/);
  assert.match(packageJson, /claudeCodeUsage\.codex\.dataDirectory/);
  assert.doesNotMatch(settings, /codex\.(?:auth|telemetry)/i);
});
