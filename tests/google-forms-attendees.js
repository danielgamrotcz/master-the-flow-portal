const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : '  <-- ' + detail}`);
  if (!condition) failures++;
}

function formResponse(submittedEmail, answers) {
  return {
    getRespondentEmail: () => submittedEmail,
    getItemResponses: () => Object.entries(answers).map(([title, value]) => ({
      getItem: () => ({ getTitle: () => title }),
      getResponse: () => value,
    })),
  };
}

const legacyResponses = [];
const picnicResponses = [];
const context = vm.createContext({
  FormApp: {
    openById: id => ({ getResponses: () => id === 'PICNIC_TEST_FORM' ? picnicResponses : legacyResponses }),
  },
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: name => name === 'PICNIC_FORM_ID' ? 'PICNIC_TEST_FORM' : null }),
  },
  Map,
  Set,
  Date,
  String,
  Object,
});

const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'google_forms_attendees.gs'), 'utf8');
vm.runInContext(source, context);

check('Piknik používá samostatný čistý formulář', /FormApp\.create\(PICNIC_FORM\.title\)/.test(source) && /PICNIC_FORM_ID/.test(source));
check('Čistý formulář povoluje jen čtyři potřebná pole', /allowedIds = new Set\(\[emailTextItem\.getId\(\), nameItem\.getId\(\), bioItem\.getId\(\), consentItem\.getId\(\)\]\)/.test(source) && /unexpectedItems/.test(source));
check('Konfigurace formuláře nevyžaduje přihlášení ke Google účtu', /\.setCollectEmail\(false\)[\s\S]*\.setLimitOneResponsePerUser\(false\)/.test(source));
check('Konfigurace nahradí vestavěný sběr vlastní validovanou e-mailovou otázkou', /form\.addTextItem\(\)\.setTitle\('E-mail'\)/.test(source) && /requireTextIsEmail\(\)/.test(source));
check('Popis profilu je nepovinný a zveřejnění má povinnou volbu', /addParagraphTextItem\(\)[\s\S]*bioItem[\s\S]*\.setRequired\(false\)/.test(source) && /consentItem[\s\S]*\.setChoiceValues\(\[ATTENDEE_SYNC\.consentYes, ATTENDEE_SYNC\.consentNo\]\)[\s\S]*\.setRequired\(true\)/.test(source));
check('Původní formulář se uzavře, ale jeho odpovědi se nemažou', /archiveOriginalRegistrationForm/.test(source) && /setAcceptingResponses\(false\)/.test(source) && !/deleteResponse/.test(source));
check('Původní formulář lze bezpečně obnovit pro hlavní program i piknik', /restoreOriginalRegistrationForm/.test(source) && /setAcceptingResponses\(true\)/.test(source) && /Přijdu jen na piknik po 18:00/.test(source) && /PageNavigationType\.CONTINUE/.test(source));
check('Samostatný piknikový formulář po obnově netvrdí, že je hlavní program plný', /znovu otevřená i registrace na hlavní program/.test(source));
check('Synchronizace čte archivní i nový piknikový formulář', /\.\.\.legacyResponses, \.\.\.picnicResponses/.test(source));

function payload() {
  return vm.runInContext('attendeePayload_()', context);
}

const consentYes = 'Souhlasím se zveřejněním mého jména, popisu a rozsahu účasti';
const baseAnswers = {
  'Jméno a příjmení': 'Testovací účastník',
  'Pár vět o vás': 'Bezpečný testovací profil.',
  'Jak to zatím vidíte s účastí?': 'Dorazím na oficiální část 13:00–18:00',
  'Zveřejnění na stránce srazu': consentYes,
};

legacyResponses.push(formResponse('submitted@example.test', baseAnswers));
let result = payload();
check('Profil se zadaným e-mailem a souhlasem se zařadí', result.attendees.length === 1);
check('Zadaný e-mail se nezveřejní', !JSON.stringify(result).includes('example.test'));
check('Veřejný payload obsahuje pouze nutná pole a interní souhlas', Object.keys(result.attendees[0]).sort().join(',') === 'attendance,bio,consent,name');
check('Počet registrací zahrnuje i lidi bez veřejného profilu', result.registeredCount === 1, String(result.registeredCount));
check('Oficiální a piknikový počet se vedou odděleně', result.officialRegisteredCount === 1 && result.picnicRegisteredCount === 0, JSON.stringify(result));

legacyResponses.push(formResponse('', {
  ...baseAnswers,
  'E‑mail': 'manual@example.test',
  'Jméno a příjmení': 'Profil s ručně zadaným e-mailem',
}));
result = payload();
check('Ručně zadaný e-mail bez Google účtu se započítá', result.attendees.length === 2 && result.registeredCount === 2);
check('Ručně zadaný e-mail se nezveřejní', !JSON.stringify(result).includes('manual@example.test'));

legacyResponses.push(formResponse('', {
  ...baseAnswers,
  'Jméno a příjmení': 'Profil bez e-mailu',
}));
result = payload();
check('Odpověď bez e-mailu se ignoruje', result.attendees.length === 2 && result.registeredCount === 2);

legacyResponses.push(formResponse('submitted@example.test', {
  ...baseAnswers,
  'Zveřejnění na stránce srazu': 'Nechci být na stránce uveden/a',
}));
result = payload();
check('Pozdější odvolání souhlasu profil odstraní', result.attendees.length === 1 && result.registeredCount === 2);

legacyResponses.length = 0;
picnicResponses.length = 0;
legacyResponses.push(formResponse('returning@example.test', baseAnswers));
picnicResponses.push(formResponse('returning@example.test', {
  'Jméno a příjmení': 'Účastník A',
  'Pár vět o vás': 'Přijdu i na piknik.',
  'Zveřejnění na stránce srazu': consentYes,
}));
picnicResponses.push(formResponse('', {
  'E-mail': 'picnic@example.test',
  'Jméno a příjmení': 'Účastník jen na piknik',
}));
result = payload();
check('Pozdější pikniková odpověď stejného e-mailu zachová místo v hlavním programu', result.officialRegisteredCount === 1 && result.registeredCount === 1, JSON.stringify(result));
check('Piknik počítá účastníky hlavního programu i registrace pouze na piknik', result.picnicRegisteredCount === 2, String(result.picnicRegisteredCount));
check('Pikniková registrace bez veřejného profilu se započítá', result.attendees.length === 1 && result.picnicRegisteredCount === 2, JSON.stringify(result));
check('Nový veřejný profil účastníka hlavního programu zachová rozsah Hlavní program + piknik', result.attendees[0].attendance === 'official_and_picnic', JSON.stringify(result.attendees[0]));

legacyResponses.length = 0;
picnicResponses.length = 0;
picnicResponses.push(formResponse('', {
  'E-mail': 'public-picnic@example.test',
  'Jméno a příjmení': 'Veřejný účastník pikniku',
  'Pár vět o vás': 'Přicházím poznat nové lidi.',
  'Zveřejnění na stránce srazu': consentYes,
}));
picnicResponses.push(formResponse('', {
  'E-mail': 'private-picnic@example.test',
  'Jméno a příjmení': 'Neveřejný účastník pikniku',
  'Pár vět o vás': 'Tento popis se nesmí zveřejnit.',
  'Zveřejnění na stránce srazu': 'Nechci být na stránce uveden/a',
}));
result = payload();
check('Nový piknikový profil se souhlasem vytvoří kartu Jen piknik', result.attendees.length === 1 && result.attendees[0].name === 'Veřejný účastník pikniku' && result.attendees[0].bio === 'Přicházím poznat nové lidi.' && result.attendees[0].attendance === 'picnic_only', JSON.stringify(result));
check('Nesouhlas nezabrání registraci, ale profil nezveřejní', result.picnicRegisteredCount === 2 && !JSON.stringify(result.attendees).includes('Neveřejný'), JSON.stringify(result));
check('E-maily z nového profilového formuláře se nezveřejní', !JSON.stringify(result).includes('example.test'));

legacyResponses.length = 0;
picnicResponses.length = 0;
legacyResponses.push(formResponse('long@example.test', {
  ...baseAnswers,
  'Pár vět o vás': 'a'.repeat(1300),
}));
result = payload();
check('Příliš dlouhý popis se bezpečně zkrátí', result.attendees[0].bio.length === 1200 && result.attendees[0].bio.endsWith('…'), String(result.attendees[0].bio.length));

console.log(failures === 0 ? '\nGOOGLE FORMS SYNC: VŠE PROŠLO' : `\n${failures} TESTŮ GOOGLE FORMS SYNC SELHALO`);
process.exit(failures === 0 ? 0 : 1);
