// Ověří, že cache-busting verze assetů stránky srazu odpovídají jejich obsahu.
const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const { resolve } = require('path');

let failures = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : '  <-- ' + detail}`);
  if (!condition) failures++;
}

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'sraz/index.html'), 'utf8');
const assets = [
  {
    label: 'CSS srazu',
    file: 'sraz/styles.css',
    pattern: /href="\/sraz\/styles\.css\?v=([0-9a-f]{7})"/g
  },
  {
    label: 'JavaScript srazu',
    file: 'sraz/app.js',
    pattern: /src="\/sraz\/app\.js\?v=([0-9a-f]{7})"/g
  }
];

for (const asset of assets) {
  const matches = [...html.matchAll(asset.pattern)];
  check(`${asset.label} má právě jednu sedmimístnou verzi`, matches.length === 1, `nalezeno ${matches.length}`);
  if (matches.length !== 1) continue;

  const expected = createHash('sha256')
    .update(readFileSync(resolve(root, asset.file)))
    .digest('hex')
    .slice(0, 7);
  const actual = matches[0][1];
  check(`${asset.label} používá hash aktuálního obsahu`, actual === expected, `HTML ${actual}, soubor ${expected}`);
}

if (failures) {
  console.error(`\n${failures} KONTROL VERZÍ ASSETŮ SELHALO`);
  process.exit(1);
}

console.log('\nVERZE ASSETŮ SRAZU: VŠE PROŠLO');
