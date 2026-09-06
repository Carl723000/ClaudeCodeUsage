import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import Module = require('node:module');

import { I18n } from '../i18n';

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

test('Claude date labels use the configured timezone for Today and Yesterday', () => {
  const previousLanguage = I18n.getCurrentLanguage();
  const previousTimezone = I18n.getTimezone();
  try {
    I18n.setLanguage('en');
    I18n.setTimezone('Asia/Tokyo');
    withWebviewProvider((provider) => {
      assert.equal(
        provider.formatDateTime(
          new Date('2026-09-03T14:00:00.000Z'),
          new Date('2026-09-03T15:00:00.000Z'),
        ),
        'Yesterday 23:00',
      );
      I18n.setTimezone('Pacific/Honolulu');
      assert.equal(
        provider.formatDateTime(
          new Date('2026-09-03T14:00:00.000Z'),
          new Date('2026-09-03T15:00:00.000Z'),
        ),
        'Today 04:00',
      );
    });
  } finally {
    I18n.setLanguage(previousLanguage);
    I18n.setTimezone(previousTimezone);
  }
});

test('Claude date labels walk configured civil days across a DST transition', () => {
  const previousLanguage = I18n.getCurrentLanguage();
  const previousTimezone = I18n.getTimezone();
  try {
    I18n.setLanguage('en');
    I18n.setTimezone('America/New_York');
    withWebviewProvider((provider) => {
      assert.equal(
        provider.formatDateTime(
          new Date('2026-03-08T06:30:00.000Z'),
          new Date('2026-03-09T04:30:00.000Z'),
        ),
        'Yesterday 01:30',
      );
    });
  } finally {
    I18n.setLanguage(previousLanguage);
    I18n.setTimezone(previousTimezone);
  }
});

test('Claude date labels choose the year branch in the configured timezone', () => {
  const previousLanguage = I18n.getCurrentLanguage();
  const previousTimezone = I18n.getTimezone();
  try {
    I18n.setLanguage('en');
    I18n.setTimezone('Asia/Tokyo');
    withWebviewProvider((provider) => {
      assert.equal(
        provider.formatDateTime(
          new Date('2025-06-15T12:00:00.000Z'),
          new Date('2026-01-01T04:00:00.000Z'),
        ),
        '2025-06-15',
      );
    });
  } finally {
    I18n.setLanguage(previousLanguage);
    I18n.setTimezone(previousTimezone);
  }
});

test('Claude date labels preserve compact same-year and invalid-date output', () => {
  const previousLanguage = I18n.getCurrentLanguage();
  const previousTimezone = I18n.getTimezone();
  try {
    I18n.setLanguage('en');
    I18n.setTimezone('Asia/Tokyo');
    withWebviewProvider((provider) => {
      assert.equal(
        provider.formatDateTime(
          new Date('2026-06-01T10:00:00.000Z'),
          new Date('2026-09-03T15:00:00.000Z'),
        ),
        '06-01 19:00',
      );
      assert.equal(provider.formatDateTime(new Date(Number.NaN)), '-');
      assert.equal(provider.formatDateTime(new Date(0)), '-');
    });
  } finally {
    I18n.setLanguage(previousLanguage);
    I18n.setTimezone(previousTimezone);
  }
});

test('Claude date labels reuse localized Today and Yesterday copy in every UI locale', () => {
  const previousLanguage = I18n.getCurrentLanguage();
  const previousTimezone = I18n.getTimezone();
  try {
    I18n.setTimezone('Asia/Tokyo');
    withWebviewProvider((provider) => {
      for (const language of ['en', 'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id'] as const) {
        I18n.setLanguage(language);
        assert.equal(
          provider.formatDateTime(
            new Date('2026-09-03T14:00:00.000Z'),
            new Date('2026-09-03T15:00:00.000Z'),
          ),
          I18n.t.popup.yesterday + ' 23:00',
          language,
        );
      }
    });
  } finally {
    I18n.setLanguage(previousLanguage);
    I18n.setTimezone(previousTimezone);
  }
});

test('Claude date labels reuse configured-zone Intl formatters across rows', () => {
  const previousLanguage = I18n.getCurrentLanguage();
  const previousTimezone = I18n.getTimezone();
  try {
    I18n.setLanguage('en');
    I18n.setTimezone('Asia/Tokyo');
    withWebviewProvider((provider) => {
      const OriginalDateTimeFormat = Intl.DateTimeFormat;
      let constructions = 0;
      const CountingDateTimeFormat = function(...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
        constructions++;
        return Reflect.construct(OriginalDateTimeFormat, args);
      } as unknown as typeof Intl.DateTimeFormat;
      CountingDateTimeFormat.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf.bind(OriginalDateTimeFormat);
      (Intl as any).DateTimeFormat = CountingDateTimeFormat;
      try {
        const now = new Date('2026-09-03T15:00:00.000Z');
        provider.formatDateTime(new Date('2026-09-03T14:00:00.000Z'), now);
        provider.formatDateTime(new Date('2026-09-03T13:00:00.000Z'), now);
        assert.ok(constructions <= 2, `expected at most two formatter constructions, got ${constructions}`);
      } finally {
        (Intl as any).DateTimeFormat = OriginalDateTimeFormat;
      }
    });
  } finally {
    I18n.setLanguage(previousLanguage);
    I18n.setTimezone(previousTimezone);
  }
});
