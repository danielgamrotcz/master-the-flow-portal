// Permanent contract: generated share pages protect ticket privacy and HTML.
// Synthetic ASSETS only; no network, credentials or community data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = path.join(__dirname, '..');
  const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const helpers = dataUrl(fs.readFileSync(path.join(root, 'functions/_carddata.js'), 'utf8'));
  const source = fs.readFileSync(path.join(root, 'functions/card/[id].js'), 'utf8')
    .replace("'../_carddata.js'", `'${helpers}'`);
  const { onRequestGet } = await import(dataUrl(source));
  const env = { ASSETS: { fetch: async () => Response.json({ cards: [
    { id: '2026-10-22-01', title: '<script>bad</script>', excerpt: '" onload="bad' },
  ] }) } };
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(null, { status: 404 });
  try {
    for (const [id, query, cache] of [
      ['2026-10-22-01', '', 'public, max-age=300'],
      ['2026-10-22-01', '?s=synthetic.ticket', 'private, no-store'],
      ['invalid', '', 'no-store'],
    ]) {
      const response = await onRequestGet({ env, params: { id }, request: new Request('https://portal.example/card/' + id + query) });
      assert.equal(response.headers.get('Cache-Control'), cache);
      assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
      assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.match(response.headers.get('Content-Security-Policy'), /default-src 'none'/);
      assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
      assert.match(response.headers.get('Strict-Transport-Security'), /max-age=31536000/);
      if (id !== 'invalid') {
        const html = await response.text();
        assert.ok(!html.includes('<script>bad</script>'));
        assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
        if (query) assert.ok(html.includes('?s=synthetic.ticket#card/'));
      } else {
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('Location'), 'https://portal.example/');
      }
    }
  } finally {
    global.fetch = originalFetch;
  }
  console.log('PASS generated card security headers, escaping, redirect and ticket cache privacy');
})().catch(error => { console.error(error); process.exit(1); });
