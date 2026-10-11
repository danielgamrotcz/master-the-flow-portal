const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : '  <-- ' + detail}`);
  if (!condition) failures++;
}

const calls = [];
const guests = [];
function responseFor(email, timestamp = 3000) {
  return {
    getItemResponses: () => [{
      getItem: () => ({ getTitle: () => 'E-mail' }),
      getResponse: () => email,
    }],
    getTimestamp: () => new Date(timestamp),
  };
}

const event = {
  getTitle: () => 'Vibe coding nezačíná promptem — Master the Flow Live #1',
  getStartTime: () => new Date('2026-10-21T16:00:00Z'),
  getEndTime: () => new Date('2026-10-21T17:30:00Z'),
  setGuestsCanSeeGuests: value => calls.push(['see', value]),
  setGuestsCanInviteOthers: value => calls.push(['invite', value]),
  setGuestsCanModify: value => calls.push(['modify', value]),
  setAnyoneCanAddSelf: value => calls.push(['self', value]),
  getGuestList: () => guests.map(email => ({ getEmail: () => email })),
  addGuest: email => { calls.push(['addGuest', email]); guests.push(email); },
};

const form = {
  getId: () => 'test-form-id',
  getResponses: () => [responseFor('old@example.test', 1000), responseFor('retry@example.test', 3000)],
  setConfirmationMessage: message => calls.push(['confirmation', message]),
};

const scriptProperties = new Map([['VIBE_CODING_LIVE_ACTIVATED_AT', '2000']]);
const context = vm.createContext({
  CalendarApp: { getDefaultCalendar: () => ({ getEvents: () => [event] }) },
  FormApp: { openById: () => form },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: name => scriptProperties.get(name) || null,
    setProperty: (name, value) => scriptProperties.set(name, value),
  }) },
  LockService: { getScriptLock: () => ({ waitLock: () => calls.push(['lock']), releaseLock: () => calls.push(['unlock']) }) },
  ScriptApp: {
    getProjectTriggers: () => [],
    deleteTrigger: trigger => calls.push(['deleteTrigger', trigger]),
    newTrigger: handler => ({
      forForm: () => ({ onFormSubmit: () => ({ create: () => calls.push(['trigger', handler]) }) }),
      timeBased: () => ({ everyHours: hours => ({ create: () => calls.push(['trigger', handler, hours]) }) }),
    }),
  },
  Date, String, RegExp, Set, JSON, Error, Number,
});

const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'vibe_coding_live_registration.gs'), 'utf8');
vm.runInContext(source, context);
vm.runInContext("VIBE_CODING_LIVE.formId = 'test-form-id'", context);

const response = responseFor(' New.Guest@Example.Test ');
context.__event = { source: form, response };
vm.runInContext('onVibeCodingLiveFormSubmit(__event)', context);

const privacyCalls = calls.filter(call => ['see', 'invite', 'modify', 'self'].includes(call[0]))
  .slice(0, 4).map(call => call.join(':')).join(',');
check('Soukromí hostů se nastaví před pozvánkou', privacyCalls === 'see:false,invite:false,modify:false,self:false', privacyCalls);
check('Nový e-mail se normalizuje a pozve právě jednou', calls.filter(call => call[0] === 'addGuest').length === 1
  && calls.find(call => call[0] === 'addGuest')[1] === 'new.guest@example.test');
check('Trigger používá zámek', calls.some(call => call[0] === 'lock') && calls.some(call => call[0] === 'unlock'));

calls.length = 0;
vm.runInContext('onVibeCodingLiveFormSubmit(__event)', context);
check('Opakovaný trigger neposílá druhou pozvánku', calls.filter(call => call[0] === 'addGuest').length === 0);

calls.length = 0;
vm.runInContext('reconcileVibeCodingLiveRegistrations()', context);
check('Reconciliation nepozve odpověď starší než aktivace',
  !calls.some(call => call[0] === 'addGuest' && call[1] === 'old@example.test'));
check('Reconciliation dorovná pozvánku nové odpovědi',
  calls.some(call => call[0] === 'addGuest' && call[1] === 'retry@example.test'));
check('Reconciliation používá stejný zámek jako submit trigger',
  calls.some(call => call[0] === 'lock') && calls.some(call => call[0] === 'unlock'));

calls.length = 0;
vm.runInContext('installVibeCodingLiveRegistrationAutomation()', context);
check('Instalace nastaví potvrzení formuláře', calls.some(call => call[0] === 'confirmation'
  && /Google Meet/.test(call[1]) && /záznam/i.test(call[1])));
check('Instalace vytvoří submit a reconciliation trigger', calls.filter(call => call[0] === 'trigger').length === 2
  && calls.some(call => call[1] === 'onVibeCodingLiveFormSubmit')
  && calls.some(call => call[1] === 'reconcileVibeCodingLiveRegistrations' && call[2] === 6));

check('Skript neobsahuje veřejný webhook ani export e-mailů', !/UrlFetchApp|webhook/i.test(source));

console.log(failures === 0 ? '\nVIBE CODING LIVE GOOGLE AUTOMATIZACE: VŠE PROŠLO' : `\n${failures} TESTŮ AUTOMATIZACE SELHALO`);
process.exit(failures === 0 ? 0 : 1);
