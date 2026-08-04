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

const responses = [];
const context = vm.createContext({
  FormApp: {
    openById: () => ({ getResponses: () => responses }),
  },
  Map,
  Date,
  String,
  Object,
});

const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'google_forms_attendees.gs'), 'utf8');
vm.runInContext(source, context);

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

responses.push(formResponse('submitted@example.test', baseAnswers));
let result = payload();
check('Profil se zadaným e-mailem a souhlasem se zařadí', result.length === 1);
check('Zadaný e-mail se nezveřejní', !JSON.stringify(result).includes('example.test'));
check('Veřejný payload obsahuje pouze nutná pole a interní souhlas', Object.keys(result[0]).sort().join(',') === 'attendance,bio,consent,name');

responses.push(formResponse('', {
  ...baseAnswers,
  'Jméno a příjmení': 'Neověřený profil',
}));
result = payload();
check('Odpověď bez zadaného e-mailu se ignoruje', result.length === 1);

responses.push(formResponse('submitted@example.test', {
  ...baseAnswers,
  'Zveřejnění na stránce srazu': 'Nechci být na stránce uveden/a',
}));
result = payload();
check('Pozdější odvolání souhlasu profil odstraní', result.length === 0);

console.log(failures === 0 ? '\nGOOGLE FORMS SYNC: VŠE PROŠLO' : `\n${failures} TESTŮ GOOGLE FORMS SYNC SELHALO`);
process.exit(failures === 0 ? 0 : 1);
