const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const publicContactAllowlist = new Set(['daniel@gamrot.cz']);
const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const trackedDataFiles = execFileSync('git', ['ls-files', '-z', 'data'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).split('\0').filter(file => file.endsWith('.json'));

const unsafeFiles = [];
let allowedContacts = 0;
for (const file of trackedDataFiles) {
  const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  const matches = text.match(emailPattern) || [];
  const unexpected = matches.filter(email => !publicContactAllowlist.has(email.toLowerCase()));
  allowedContacts += matches.length - unexpected.length;
  if (unexpected.length) unsafeFiles.push(file);
}

if (unsafeFiles.length) {
  console.error(`FAIL  Veřejná data obsahují nepovolený e-mail: ${unsafeFiles.join(', ')}`);
  process.exit(1);
}

console.log(`PASS  Veřejná data neobsahují nepovolené e-maily (${allowedContacts} povolené kontaktní výskyty)`);
