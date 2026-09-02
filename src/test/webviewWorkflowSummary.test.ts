import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import Module = require('node:module');

import { I18n } from '../i18n';
import { UsageData, WorkflowUsage } from '../types';

function usage(totalCost: number): UsageData {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    totalCost,
    costBreakdown: { input: totalCost, output: 0, cacheWrite: 0, cacheRead: 0 },
    messageCount: 0,
    modelBreakdown: {},
  };
}

function workflow(
  workflowId: string,
  startTime: string,
  endTime: string,
  totalCost: number,
): WorkflowUsage {
  return {
    workflowId,
    name: workflowId,
    sessionId: 'session',
    projectPath: '/fixture/project',
    projectName: 'fixture',
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    agentCount: 0,
    data: usage(totalCost),
    agents: [],
  };
}

function withWebviewProvider(run: (provider: any) => void): void {
  const originalLoad = (Module as any)._load;
  (Module as any)._load = function(request: string, parent: unknown, isMain: boolean) {
    if (request === 'vscode') {
      return { workspace: { workspaceFolders: [] } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { UsageWebviewProvider } = require('../webview') as typeof import('../webview');
    run(new UsageWebviewProvider({} as any) as any);
  } finally {
    (Module as any)._load = originalLoad;
  }
}

test('Workflows summary matches the configured-zone rolling 30-day dashboard scope', () => {
  const previousLanguage = I18n.getCurrentLanguage();
  const previousTimezone = I18n.getTimezone();
  try {
    I18n.setLanguage('en');
    I18n.setTimezone('Asia/Tokyo');
    withWebviewProvider((provider) => {
      provider.monthData = usage(40);
      provider.workflowBreakdown = [
        // The first included civil date is 2026-08-06 in Tokyo.
        workflow('included-by-start', '2026-08-05T15:00:00.000Z', '2026-09-05T00:00:00.000Z', 10),
        // One minute earlier is outside, even though this workflow ends inside the range.
        workflow('excluded-by-start', '2026-08-05T14:59:00.000Z', '2026-09-03T00:00:00.000Z', 20),
      ];

      const html = provider.renderWorkflowData(new Date('2026-09-03T15:00:00.000Z'));

      assert.match(
        html,
        /Workflows in the last 30 days: 1 · \$10\.00 · 25% share of the last 30 days' cost/,
      );
    });
  } finally {
    I18n.setLanguage(previousLanguage);
    I18n.setTimezone(previousTimezone);
  }
});

test('Workflows rolling-range summary is localized in every UI language', () => {
  const previousLanguage = I18n.getCurrentLanguage();
  const previousTimezone = I18n.getTimezone();
  const expected = {
    en: ['Workflows in the last 30 days', "share of the last 30 days' cost"],
    'de-DE': ['Workflows in den letzten 30 Tagen', 'Anteil an den Kosten der letzten 30 Tage'],
    'zh-TW': ['最近 30 天工作流', '佔最近 30 天成本'],
    'zh-CN': ['最近 30 天工作流', '占最近 30 天成本'],
    ja: ['過去30日間のワークフロー', '過去30日間のコストに占める割合'],
    ko: ['최근 30일 워크플로', '최근 30일 비용 중 비율'],
    'pt-BR': ['Workflows nos últimos 30 dias', 'dos custos dos últimos 30 dias'],
    id: ['Workflow 30 hari terakhir', 'proporsi biaya 30 hari terakhir'],
  } as const;
  try {
    I18n.setTimezone('UTC');
    withWebviewProvider((provider) => {
      provider.monthData = usage(10);
      provider.workflowBreakdown = [
        workflow('recent', '2026-09-01T00:00:00.000Z', '2026-09-01T01:00:00.000Z', 10),
      ];
      for (const [language, phrases] of Object.entries(expected)) {
        I18n.setLanguage(language as keyof typeof expected);
        const html = provider.renderWorkflowData(new Date('2026-09-03T12:00:00.000Z'));
        assert.ok(html.includes(phrases[0]), language);
        assert.ok(html.includes(phrases[1]), language);
      }
    });
  } finally {
    I18n.setLanguage(previousLanguage);
    I18n.setTimezone(previousTimezone);
  }
});
