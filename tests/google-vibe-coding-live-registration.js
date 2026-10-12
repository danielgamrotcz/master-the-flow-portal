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
const sent = [];
let quota = 100;
let mailFailure = false;
function responseFor(email, timestamp = 3000) {
  return {
    getId: () => email.trim().toLowerCase() + ':' + timestamp,
    getItemResponses: () => [{
      getItem: () => ({ getTitle: () => 'E-mail' }),
      getResponse: () => email,
    }],
    getTimestamp: () => new Date(timestamp),
  };
}

const event = {
  getId: () => 'event-fixture@google.com',
  getTitle: () => 'Vibe coding nezačíná promptem — Master the Flow Live #1',
  getStartTime: () => new Date('2026-10-21T16:00:00Z'),
  getEndTime: () => new Date('2026-10-21T18:00:00Z'),
  setTitle: value => calls.push(['title', value]),
  setTime: (start, end) => calls.push(['time', start.getTime(), end.getTime()]),
  setDescription: value => calls.push(['description', value]),
  setGuestsCanSeeGuests: value => calls.push(['see', value]),
  setGuestsCanInviteOthers: value => calls.push(['invite', value]),
  setGuestsCanModify: value => calls.push(['modify', value]),
  setAnyoneCanAddSelf: value => calls.push(['self', value]),
  getGuestList: includeOwner => (includeOwner ? [...guests, 'owner@example.test'] : guests).map(email => ({ getEmail: () => email })),
  addGuest: email => { calls.push(['addGuest', email]); guests.push(email); },
};

const form = {
  getId: () => 'test-form-id',
  getResponses: () => [responseFor('old@example.test', 1000), responseFor('retry@example.test', 3000)],
  setConfirmationMessage: message => calls.push(['confirmation', message]),
  setTitle: value => calls.push(['formTitle', value]),
  setDescription: value => calls.push(['formDescription', value]),
  getItems: () => [{ getTitle: () => 'Jméno a příjmení', asTextItem: () => ({ setRequired: value => calls.push(['nameRequired', value]) }) }],
  getDestinationId: () => 'response-sheet-fixture',
};

const scriptProperties = new Map([['VIBE_CODING_LIVE_ACTIVATED_AT', '2000']]);
scriptProperties.set('VIBE_CODING_LIVE_EMAIL_ACTIVATED_AT', '2000');
scriptProperties.set('VIBE_CODING_LIVE_MEET_URL', 'https://meet.google.com/aaa-bbbb-ccc');
const context = vm.createContext({
  CalendarApp: { getDefaultCalendar: () => ({ getEvents: () => [event], getEventById: id => id === event.getId() ? event : null }) },
  MailApp: {
    getRemainingDailyQuota: () => quota,
    sendEmail: message => { if (mailFailure) throw new Error('fixture-mail-failure'); sent.push(message); },
  },
  console: { log: () => {} },
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
check('Nová registrace dostane samostatný potvrzovací e-mail', sent.length === 1 && sent[0].to === 'new.guest@example.test');
check('E-mail obsahuje Meet a správný čas, nikoli seznam hostů', sent[0].body.includes('https://meet.google.com/aaa-bbbb-ccc')
  && sent[0].body.includes('18:00–20:00') && !sent[0].cc && !sent[0].bcc && !sent[0].body.includes('owner@example.test'));
check('Trigger používá zámek', calls.some(call => call[0] === 'lock') && calls.some(call => call[0] === 'unlock'));

calls.length = 0;
vm.runInContext('onVibeCodingLiveFormSubmit(__event)', context);
check('Opakovaný trigger neposílá druhou pozvánku', calls.filter(call => call[0] === 'addGuest').length === 0);
check('Opakovaný trigger neposílá druhý e-mail', sent.length === 1);

calls.length = 0;
context.__event.response = responseFor('owner@example.test');
vm.runInContext('onVibeCodingLiveFormSubmit(__event)', context);
check('Pořadatel dostane potvrzení bez přidání sebe jako hosta', sent.length === 2 && sent[1].to === 'owner@example.test'
  && !calls.some(call => call[0] === 'addGuest'));

context.__event.response = responseFor('retry-mail@example.test');
mailFailure = true;
try { vm.runInContext('onVibeCodingLiveFormSubmit(__event)', context); } catch {}
check('Neúspěšný e-mail není označený jako odeslaný', !scriptProperties.has('VIBE_CODING_LIVE_SENT_retry-mail@example.test:3000'));
mailFailure = false;
calls.length = 0;
vm.runInContext('onVibeCodingLiveFormSubmit(__event)', context);
check('Retry po chybě mailu odešle potvrzení už přidanému hostu', sent.filter(m => m.to === 'retry-mail@example.test').length === 1
  && !calls.some(call => call[0] === 'addGuest'));

quota = 0;
context.__event.response = responseFor('quota@example.test');
let quotaRejected = false;
try { vm.runInContext('onVibeCodingLiveFormSubmit(__event)', context); } catch { quotaRejected = true; }
check('Vyčerpaná kvóta zachová registraci pro retry', quotaRejected && !scriptProperties.has('VIBE_CODING_LIVE_SENT_quota@example.test:3000'));
quota = 100;

calls.length = 0;
vm.runInContext('reconcileVibeCodingLiveRegistrations()', context);
check('Reconciliation nepozve odpověď starší než aktivace',
  !calls.some(call => call[0] === 'addGuest' && call[1] === 'old@example.test'));
check('Reconciliation dorovná pozvánku nové odpovědi',
  calls.some(call => call[0] === 'addGuest' && call[1] === 'retry@example.test'));
check('Reconciliation používá stejný zámek jako submit trigger',
  calls.some(call => call[0] === 'lock') && calls.some(call => call[0] === 'unlock'));

calls.length = 0;
const sentBeforeInstall = sent.length;
vm.runInContext('installVibeCodingLiveRegistrationAutomation()', context);
check('Instalace nastaví potvrzení formuláře', calls.some(call => call[0] === 'confirmation'
  && /Google Meet/.test(call[1]) && /záznam/i.test(call[1])));
check('Potvrzení nabízí postup při nedoručení pozvánky', calls.some(call => call[0] === 'confirmation'
  && /e-mailem/.test(call[1]) && /spam/.test(call[1]) && /daniel@gamrot\.cz/.test(call[1])));
check('Instalace vytvoří submit a reconciliation trigger', calls.filter(call => call[0] === 'trigger').length === 2
  && calls.some(call => call[1] === 'onVibeCodingLiveFormSubmit')
  && calls.some(call => call[1] === 'reconcileVibeCodingLiveRegistrations' && call[2] === 6));
check('Příprava a instalace nerozesílají staré registrace', sent.length === sentBeforeInstall);
check('Migrace uloží stabilní iCalUID', scriptProperties.get('VIBE_CODING_LIVE_EVENT_ICAL_ID') === 'event-fixture@google.com');
check('Migrace nastaví konec 20:00 a jméno jako nepovinné', calls.some(c => c[0] === 'time' && c[2] === Date.parse('2026-10-21T18:00:00Z'))
  && calls.some(c => c[0] === 'nameRequired' && c[1] === false));
check('Příprava zachová původní cutover', scriptProperties.get('VIBE_CODING_LIVE_EMAIL_ACTIVATED_AT') === '2000');
event.getTitle = () => 'Přejmenovaný rozhovor';
check('Lookup přes ID přežije přejmenování', vm.runInContext('vibeCodingLiveEvent_()', context) === event);

const sentBeforeOld = sent.length;
scriptProperties.set('VIBE_CODING_LIVE_EMAIL_ACTIVATED_AT', '4000');
context.__event.response = responseFor('old-cutover@example.test');
vm.runInContext('onVibeCodingLiveFormSubmit(__event)', context);
check('Nový mailový cutover blokuje zpětné rozesílání', sent.length === sentBeforeOld);
scriptProperties.set('VIBE_CODING_LIVE_EMAIL_ACTIVATED_AT', '2000');
scriptProperties.set('VIBE_CODING_LIVE_MEET_URL', 'https://untrusted.example.test');
context.__event.response = responseFor('invalid-link@example.test');
let badLinkRejected = false;
try { vm.runInContext('onVibeCodingLiveFormSubmit(__event)', context); } catch { badLinkRejected = true; }
check('Neplatný odkaz zastaví odeslání', badLinkRejected && sent.length === sentBeforeOld);

check('Skript neobsahuje veřejný webhook ani export e-mailů', !/UrlFetchApp|webhook/i.test(source));

console.log(failures === 0 ? '\nVIBE CODING LIVE GOOGLE AUTOMATIZACE: VŠE PROŠLO' : `\n${failures} TESTŮ AUTOMATIZACE SELHALO`);
process.exit(failures === 0 ? 0 : 1);
