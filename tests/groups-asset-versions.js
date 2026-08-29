const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const { resolve } = require('path');

let failures = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : '  <-- ' + detail}`);
  if (!condition) failures++;
}

const root = resolve(__dirname, '..');
const pages = ['skupinky/index.html', 'skupinky/admin/index.html'];
const assets = [
  { label: 'CSS skupinek', file: 'skupinky/styles.css', pattern: /href="\/skupinky\/styles\.css\?v=([0-9a-f]{7})"/g },
  { label: 'JavaScript skupinek', file: 'skupinky/app.js', pattern: /src="\/skupinky\/app\.js\?v=([0-9a-f]{7})"/g },
];

// Tento přesný PNG byl nezávisle dekódovaný na produkční adresu. Hash brání,
// aby vizuálně platný QR omylem začal znovu mířit na lokální nebo Tailscale URL.
const productionQrHash = '3cd0153de5a1e8fcd7947476fff9b75c352a5a0b740e21d1c5ce06e6cba67db1';

for (const page of pages) {
  const html = readFileSync(resolve(root, page), 'utf8');
  for (const asset of assets) {
    const matches = [...html.matchAll(asset.pattern)];
    const expected = createHash('sha256').update(readFileSync(resolve(root, asset.file))).digest('hex').slice(0, 7);
    check(`${page}: ${asset.label} má aktuální sedmimístnou verzi`, matches.length === 1 && matches[0][1] === expected, matches.length ? `HTML ${matches[0][1]}, soubor ${expected}` : 'verze nenalezena');
  }
}

const adminHtml = readFileSync(resolve(root, 'skupinky/admin/index.html'), 'utf8');
const actualQrHash = createHash('sha256').update(readFileSync(resolve(root, 'skupinky/qr.png'))).digest('hex');
check('QR skupinek míří na ověřenou produkční adresu', actualQrHash === productionQrHash);
check('Režie uvádí produkční adresu bez Tailscale náhledu',
  adminHtml.includes('mastertheflow.cz/skupinky') && !/100\.\d+\.\d+\.\d+|localhost|127\.0\.0\.1/.test(adminHtml));

if (failures) process.exit(1);
console.log('\nVERZE ASSETŮ SKUPINEK: VŠE PROŠLO');
