import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderHarness } = require('./render-harness.cjs');
const locales = new Set(['en', 'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id']);

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:4173');
    if (url.pathname === '/health') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('ok');
      return;
    }
    if (url.pathname !== '/') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }

    const requestedLocale = url.searchParams.get('locale') ?? 'en';
    const locale = locales.has(requestedLocale) ? requestedLocale : 'en';
    const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
    const requestedFixture = url.searchParams.get('fixture') ?? 'default';
    const fixture = ['default', 'rootless-cycle', 'root-over-limit'].includes(requestedFixture)
      ? requestedFixture
      : 'default';
    const html = renderHarness({ locale, theme, fixture });
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(html);
  } catch {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Internal Server Error');
  }
});

server.listen(4173, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
