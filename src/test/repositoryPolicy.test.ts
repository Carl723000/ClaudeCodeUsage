import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as ts from 'typescript';

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

type AstProject = {
  readonly files: ts.SourceFile[];
  readonly declarations: ReadonlyMap<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>;
};

const BANNED_PERSISTED_PROPERTIES = /(?:^|_)(?:carry|raw(?:_?line|_?input|_?fragment)|incomplete(?:_?line|_?input))(?:$|_)/i;
const LEGACY_STRUCTURAL_PROPERTIES = new Set([
  'filesChanged',
  'patchRounds',
  'commands',
  'postChangeCommands',
]);

function projectFromSources(sources: Readonly<Record<string, string>>): AstProject {
  const files = Object.entries(sources).map(([name, text]) =>
    ts.createSourceFile(name, text, ts.ScriptTarget.ES2020, true),
  );
  const declarations = new Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>();
  for (const file of files) {
    for (const statement of file.statements) {
      if ((ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && statement.name) {
        declarations.set(statement.name.text, statement);
      }
    }
  }
  return { files, declarations };
}

function propertyName(name: ts.PropertyName | ts.MemberName | undefined): string | undefined {
  if (!name) {
    return undefined;
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function referencedTypeName(type: ts.TypeNode): string | undefined {
  if (!ts.isTypeReferenceNode(type)) {
    return undefined;
  }
  return ts.isIdentifier(type.typeName) ? type.typeName.text : undefined;
}

function persistedPropertyViolations(project: AstProject, rootName: string): string[] {
  const violations: string[] = [];
  const visited = new Set<string>();
  const inspectType = (type: ts.TypeNode | undefined, path: string): void => {
    if (!type) {
      return;
    }
    if (ts.isTypeReferenceNode(type)) {
      for (const argument of type.typeArguments ?? []) {
        inspectType(argument, path);
      }
      const name = referencedTypeName(type);
      if (name && project.declarations.has(name) && !visited.has(name)) {
        inspectDeclaration(project.declarations.get(name)!, `${path}.${name}`);
      }
      return;
    }
    if (ts.isArrayTypeNode(type)) {
      inspectType(type.elementType, path);
    } else if (ts.isTupleTypeNode(type)) {
      for (const element of type.elements) {
        inspectType(ts.isNamedTupleMember(element) ? element.type : element, path);
      }
    } else if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) {
      for (const item of type.types) {
        inspectType(item, path);
      }
    } else if (ts.isParenthesizedTypeNode(type)) {
      inspectType(type.type, path);
    } else if (ts.isTypeLiteralNode(type)) {
      inspectMembers(type.members, path);
    }
  };
  const inspectMembers = (members: ts.NodeArray<ts.TypeElement>, path: string): void => {
    for (const member of members) {
      if (ts.isPropertySignature(member)) {
        const name = propertyName(member.name);
        if (name && BANNED_PERSISTED_PROPERTIES.test(name)) {
          violations.push(`${path}.${name}`);
        }
        inspectType(member.type, name ? `${path}.${name}` : path);
      } else if (ts.isIndexSignatureDeclaration(member)) {
        inspectType(member.type, path);
      }
    }
  };
  const inspectDeclaration = (
    declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
    path: string,
  ): void => {
    const name = declaration.name.text;
    if (visited.has(name)) {
      return;
    }
    visited.add(name);
    if (ts.isInterfaceDeclaration(declaration)) {
      inspectMembers(declaration.members, path);
    } else {
      inspectType(declaration.type, path);
    }
  };
  const root = project.declarations.get(rootName);
  if (!root) {
    return [`missing root ${rootName}`];
  }
  inspectDeclaration(root, rootName);
  return violations;
}

function functionDeclarations(file: ts.SourceFile): ReadonlyMap<string, ts.FunctionLikeDeclaration> {
  const declarations = new Map<string, ts.FunctionLikeDeclaration>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      declarations.set(node.name.text, node);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
      node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      declarations.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return declarations;
}

function hasUnsafeSpread(object: ts.ObjectLiteralExpression): boolean {
  return object.properties.some((property) => {
    if (!ts.isSpreadAssignment(property)) {
      return false;
    }
    const expression = ts.isParenthesizedExpression(property.expression)
      ? property.expression.expression
      : property.expression;
    return !ts.isConditionalExpression(expression) ||
      !ts.isObjectLiteralExpression(expression.whenTrue) ||
      !ts.isObjectLiteralExpression(expression.whenFalse);
  });
}

function sanitizedDtoViolations(file: ts.SourceFile): string[] {
  const declarations = functionDeclarations(file);
  const violations: string[] = [];
  const visited = new Set<string>();
  const inspectFunction = (name: string): void => {
    if (visited.has(name)) {
      return;
    }
    visited.add(name);
    const declaration = declarations.get(name);
    if (!declaration?.body) {
      violations.push(`missing sanitizer ${name}`);
      return;
    }
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node) && hasUnsafeSpread(node)) {
        violations.push(`${name} spreads a non-object conditional value`);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^sanitize/.test(node.expression.text)) {
        inspectFunction(node.expression.text);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(declaration.body, visit);
  };
  inspectFunction('sanitizeIndexV2');
  const root = declarations.get('sanitizeIndexV2');
  const returned = root?.body && ts.isBlock(root.body)
    ? root.body.statements.find(ts.isReturnStatement)?.expression
    : undefined;
  if (!returned || !ts.isObjectLiteralExpression(returned)) {
    violations.push('sanitizeIndexV2 must return an explicit object literal');
  } else {
    const branches = returned.properties.flatMap((property) =>
      ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)
        ? [propertyName(property.name)]
        : [],
    );
    const expected = ['schemaVersion', 'files', 'aggregate', 'coverage'];
    if (branches.length !== expected.length || expected.some((branch) => !branches.includes(branch))) {
      violations.push('sanitizeIndexV2 top-level branches are not exact');
    }
  }
  const atomic = declarations.get('saveCodexIndexAtomic');
  let writesSanitizedDto = false;
  const scanAtomic = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'writeFile') {
      const value = node.arguments[0];
      if (value && ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression) &&
        value.expression.expression.getText(file) === 'JSON' && value.expression.name.text === 'stringify') {
        const serialized = value.arguments[0];
        writesSanitizedDto = Boolean(serialized && ts.isCallExpression(serialized) &&
          ts.isIdentifier(serialized.expression) && serialized.expression.text === 'sanitizeIndexV2' &&
          serialized.arguments[0]?.getText(file) === 'index');
      }
    }
    ts.forEachChild(node, scanAtomic);
  };
  if (atomic?.body) {
    ts.forEachChild(atomic.body, scanAtomic);
  }
  if (!writesSanitizedDto) {
    violations.push('atomic save does not stringify sanitizeIndexV2(index)');
  }
  return violations;
}

function legacyBoundaryName(node: ts.Node): string | undefined {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if ((ts.isInterfaceDeclaration(current) || ts.isTypeAliasDeclaration(current) ||
      ts.isFunctionDeclaration(current) || ts.isClassDeclaration(current)) && current.name) {
      return current.name.text;
    }
  }
  return undefined;
}

function legacyStructuralViolations(files: readonly ts.SourceFile[]): string[] {
  const violations: string[] = [];
  const inspect = (node: ts.Node): void => {
    let name: string | undefined;
    if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) {
      name = propertyName(node.name);
    } else if (ts.isPropertyAccessExpression(node)) {
      name = node.name.text;
    } else if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
      name = node.argumentExpression.text;
    }
    if (name && LEGACY_STRUCTURAL_PROPERTIES.has(name)) {
      const boundary = legacyBoundaryName(node);
      if (!boundary || !(/^(Legacy|migrateLegacy)/.test(boundary))) {
        violations.push(`${node.getSourceFile().fileName}:${name}`);
      }
    }
    ts.forEachChild(node, inspect);
  };
  for (const file of files) {
    inspect(file);
  }
  return violations;
}

function misleadingCopyViolations(files: readonly ts.SourceFile[]): string[] {
  const violations: string[] = [];
  const misleading = /(?:files? changed|patch rounds|post[- ]?change commands?|command (?:count|overhead)|commands? (?:run|executed))/i;
  const inspect = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) && misleading.test(node.text)) {
      violations.push(`${node.getSourceFile().fileName}:${node.text}`);
    }
    if (ts.isPropertyAssignment(node) && LEGACY_STRUCTURAL_PROPERTIES.has(propertyName(node.name) ?? '')) {
      violations.push(`${node.getSourceFile().fileName}:${propertyName(node.name)}`);
    }
    ts.forEachChild(node, inspect);
  };
  for (const file of files) {
    inspect(file);
  }
  return violations;
}

function projectSourceFiles(prefix: string): Record<string, string> {
  const paths = execFileSync('git', ['ls-files', prefix], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter((path) => path.endsWith('.ts'));
  return Object.fromEntries(paths.map((path) => [path, repoFile(path)]));
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

test('semantic Codex policy validators reject nested DTO leaks, comment-only sanitizers, and misleading legacy fixtures', () => {
  const nestedLeak = projectFromSources({
    'fixture.ts': [
      'interface CodexIndexV2 { files: Record<string, CodexFileContribution>; }',
      'interface CodexFileContribution { migration: CodexPeriodMigrationState; }',
      'interface CodexPeriodMigrationState { days: Record<string, CodexDailySlice>; }',
      'interface CodexDailySlice { rawLine: string; carry: string; }',
    ].join('\n'),
  });
  assert.deepEqual(
    persistedPropertyViolations(nestedLeak, 'CodexIndexV2'),
    [
      'CodexIndexV2.files.CodexFileContribution.migration.CodexPeriodMigrationState.days.CodexDailySlice.rawLine',
      'CodexIndexV2.files.CodexFileContribution.migration.CodexPeriodMigrationState.days.CodexDailySlice.carry',
    ],
  );

  const commentOnly = ts.createSourceFile('fixture.ts', [
    'function sanitizeIndexV2(index: unknown) { return { schemaVersion: 2, files: {}, aggregate: {}, coverage: {} }; }',
    'async function saveCodexIndexAtomic(index: unknown) {',
    '  // JSON.stringify(sanitizeIndexV2(index))',
    '  await handle.writeFile(JSON.stringify(index));',
    '}',
  ].join('\n'), ts.ScriptTarget.ES2020, true);
  assert.deepEqual(
    sanitizedDtoViolations(commentOnly),
    ['atomic save does not stringify sanitizeIndexV2(index)'],
  );

  const badStructural = ts.createSourceFile(
    'codexUsage.ts',
    'function summarize(value: { patchRounds: number }) { return value.patchRounds; }',
    ts.ScriptTarget.ES2020,
    true,
  );
  const badCopy = ts.createSourceFile(
    'codexView.ts',
    "const copy = { structuralProxy: 'Post-change commands run' };",
    ts.ScriptTarget.ES2020,
    true,
  );
  assert.deepEqual(legacyStructuralViolations([badStructural]), [
    'codexUsage.ts:patchRounds',
    'codexUsage.ts:patchRounds',
  ]);
  assert.deepEqual(misleadingCopyViolations([badCopy]), [
    'codexView.ts:Post-change commands run',
  ]);
});

test('Codex schema 2 persistence uses semantic AST gates across the complete DTO graph', () => {
  const sources = projectSourceFiles('src');
  const project = projectFromSources(sources);
  const index = project.files.find((file) => file.fileName === 'src/providers/codex/codexIndex.ts');
  assert.ok(index, 'missing codexIndex source');

  assert.deepEqual(persistedPropertyViolations(project, 'CodexIndexV2'), []);
  assert.deepEqual(sanitizedDtoViolations(index), []);

  const codexFiles = project.files.filter((file) =>
    file.fileName.startsWith('src/providers/codex/'),
  );
  assert.deepEqual(legacyStructuralViolations(codexFiles), []);
  assert.deepEqual(
    misleadingCopyViolations([
      project.files.find((file) => file.fileName === 'src/codexView.ts')!,
      project.files.find((file) => file.fileName === 'src/i18n.ts')!,
    ]),
    [],
  );
});

test('Codex schema 2 production files are regular files and the architecture records its persisted contract', () => {
  const productionFiles = [
    'src/providers/codex/codexDedup.ts',
    'src/providers/codex/codexIdentity.ts',
    'src/providers/codex/codexIndex.ts',
    'src/providers/codex/codexIndexClient.ts',
    'src/providers/codex/codexIndexWorker.ts',
    'src/providers/codex/codexInsights.ts',
    'src/providers/codex/codexJsonlScanner.ts',
    'src/providers/codex/codexManifest.ts',
    'src/providers/codex/codexParser.ts',
    'src/providers/codex/codexPeriodIndex.ts',
    'src/providers/codex/codexProvider.ts',
    'src/providers/codex/codexSchema.ts',
    'src/providers/codex/codexUsage.ts',
    'src/providers/codex/codexWorkerProtocol.ts',
  ];
  const staged = execFileSync('git', ['ls-files', '--stage', '--', ...productionFiles], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const modes = new Map(
    staged.trim().split('\n').filter(Boolean).map((line) => {
      const [mode, , , file] = line.split(/\s+/, 4);
      return [file, mode];
    }),
  );
  for (const file of productionFiles) {
    assert.equal(modes.get(file), '100644', `${file} must be mode 100644`);
  }

  const english = repoFile('ARCHITECTURE.md');
  const chinese = repoFile('ARCHITECTURE-zh-CN.md');
  for (const [document, patterns] of [
    [english, [
      /schema 2[\s\S]*codex-index-v1\.json/i,
      /all-time[\s\S]*verified aggregate[\s\S]*period slices/i,
      /asOfDay[\s\S]*7[\s\S]*30[\s\S]*all-time/i,
      /16 file passes[\s\S]*32 MiB[\s\S]*1 MiB \+ 1[\s\S]*256 KiB[\s\S]*1 MiB/i,
      /SSH[\s\S]*HTTPS[\s\S]*canonical/i,
      /strictly exact[\s\S]*active\/archive[\s\S]*ambiguous/i,
      /five structural call proxies[\s\S]*not file, command, or review counts/i,
      /never[\s\S]*stores a raw incomplete line or a carry buffer/i,
      /cancellation checkpoints[\s\S]*resumes/i,
    ]],
    [chinese, [
      /内部 schema 2[\s\S]*codex-index-v1\.json/,
      /已验证的[\s\S]*aggregate[\s\S]*期间切片/,
      /asOfDay[\s\S]*7 天[\s\S]*30 天[\s\S]*all-time/,
      /16 次文件遍历[\s\S]*32 MiB[\s\S]*1 MiB \+ 1[\s\S]*256 KiB[\s\S]*1 MiB/,
      /SSH[\s\S]*HTTPS[\s\S]*规范化/,
      /active\/archive[\s\S]*严格精确[\s\S]*歧义/,
      /五个结构调用代理量[\s\S]*不是文件、命令或审阅次数/,
      /v2 不保存未完成原始行，也不保存 carry buffer/,
      /cancel checkpoint[\s\S]*resume/,
    ]],
  ] as Array<[string, RegExp[]]>) {
    for (const pattern of patterns) {
      assert.match(document, pattern);
    }
  }
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

test('changelog records the V2.2.2 energy patch after the released V2.2.1 baseline', () => {
  const changelog = repoFile('CHANGELOG.md');
  assert.match(changelog, /^## \[2\.2\.2\] — Unreleased$/m);
  assert.match(changelog, /^## \[2\.2\.1\] — 2026-07-18$/m);
  assert.match(changelog, /Suspend polling and file watchers in\s+unfocused VS Code windows/);
  assert.match(changelog, /Back off repeated quota authentication failures/);
  assert.match(changelog, /^## \[2\.2\.0\] — 2026-07-07$/m);
  assert.match(changelog, /OpenAI Codex/);
  assert.doesNotMatch(changelog, /^## \[2\.2\.[01]\] — Unreleased$/m);
});

test('changelog records the v2.3.0 candidate', () => {
  const changelog = repoFile('CHANGELOG.md');
  assert.match(changelog, /^## \[2\.3\.0\] — Unreleased$/m);
});

test('release announcements are exact-version and user-disableable', () => {
  const extension = repoFile('src/extension.ts');
  const settings = repoFile('src/settings.ts');

  assert.match(extension, /'2\.3\.0'/);
  assert.doesNotMatch(extension, /'2\.2'\s*:/);
  assert.match(settings, /key:\s*'releaseAnnouncements'/);
  assert.match(settings, /default:\s*true/);
});
test('Codex beta settings use safe provider-aware defaults', () => {
  const settings = repoFile('src/settings.ts');
  const webview = repoFile('src/webview.ts');
  const packageJson = repoFile('package.json');

  assert.match(settings, /key:\s*'codex\.enabled'[\s\S]*?default:\s*true/);
  assert.match(settings, /key:\s*'codex\.fileWatchSeconds'[\s\S]*?default:\s*'30'/);
  assert.match(settings, /key:\s*'statusBarProvider'[\s\S]*?default:\s*'auto'/);
  assert.match(settings, /key:\s*'codex\.statusMetric'[\s\S]*?default:\s*'fresh'/);
  assert.match(settings, /key:\s*'codex\.optimization\.enabled'[\s\S]*?default:\s*true/);
  assert.match(webview, /'general'[\s\S]*?'providers'[\s\S]*?'features'/);
  assert.match(packageJson, /claudeCodeUsage\.codex\.dataDirectory/);
  assert.doesNotMatch(settings, /codex\.(?:auth|telemetry)/i);
});
