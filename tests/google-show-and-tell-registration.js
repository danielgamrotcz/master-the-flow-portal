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
function responseFor(email) {
  return {
    getItemResponses: () => [{
      getItem: () => ({ getTitle: () => 'E-mail' }),
      getResponse: () => email,
    }],
  };
}
const event = {
  getTitle: () => 'AI, která mi fakt funguje — online Show & Tell',
  getStartTime: () => new Date('2026-09-22T16:00:00Z'),
  getEndTime: () => new Date('2026-09-22T17:30:00Z'),
  setGuestsCanSeeGuests: value => calls.push(['see', value]),
  setGuestsCanInviteOthers: value => calls.push(['invite', value]),
  setGuestsCanModify: value => calls.push(['modify', value]),
  setAnyoneCanAddSelf: value => calls.push(['self', value]),
  getGuestList: () => guests.map(email => ({ getEmail: () => email })),
  addGuest: email => { calls.push(['addGuest', email]); guests.push(email); },
};
const form = {
  getId: () => '1UZC9CuzpTSxeLC-wi8q4tklMm3nINzXzDVEn3ViE5yA',
  getResponses: () => [responseFor('first@example.test'), responseFor('second@example.test'), responseFor('FIRST@example.test')],
};
const context = vm.createContext({
  CalendarApp: { getDefaultCalendar: () => ({ getEvents: () => [event] }) },
  FormApp: { openById: () => form },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test-only-secret' }) },
  UrlFetchApp: { fetch: (url, options) => {
    calls.push(['fetch', url, options]);
    return { getResponseCode: () => 200 };
  } },
  LockService: { getScriptLock: () => ({ waitLock: () => calls.push(['lock']), releaseLock: () => calls.push(['unlock']) }) },
  Date, String, RegExp, Set, JSON, Error,
});

const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'show_and_tell_registration.gs'), 'utf8');
vm.runInContext(source, context);

const response = {
  getItemResponses: () => [{
    getItem: () => ({ getTitle: () => 'E-mail' }),
    getResponse: () => ' New.Guest@Example.Test ',
  }],
};
vm.runInContext('onShowAndTellFormSubmit(__event)', vm.createContext ? Object.assign(context, {
  __event: { source: form, response },
}) : context);

const privacyCalls = calls.filter(call => ['see', 'invite', 'modify', 'self'].includes(call[0]))
  .slice(0, 4).map(call => call.join(':')).join(',');
check('Soukromí hostů se nastaví před pozvánkou', privacyCalls === 'see:false,invite:false,modify:false,self:false', privacyCalls);
check('Nový e-mail se normalizuje a pozve právě jednou', calls.filter(call => call[0] === 'addGuest').length === 1
  && calls.find(call => call[0] === 'addGuest')[1] === 'new.guest@example.test');
const fetchCall = calls.find(call => call[0] === 'fetch');
const webhookPayload = JSON.parse(fetchCall[2].payload);
check('Webhook dostane pouze počet unikátních registračních e-mailů', JSON.stringify(webhookPayload) === '{"registeredCount":2}');
check('Webhook nedostane registrační e-mail', !JSON.stringify(fetchCall).includes('new.guest@example.test'));

calls.length = 0;
vm.runInContext('onShowAndTellFormSubmit(__event)', context);
check('Opakovaný trigger neposílá druhou pozvánku', calls.filter(call => call[0] === 'addGuest').length === 0);
check('Opakovaný trigger počet znovu sladí', calls.filter(call => call[0] === 'fetch').length === 1);

check('Historické odpovědi se používají jen pro agregát, ne pro backfill hostů',
  !/getResponses\(\)[\s\S]{0,500}inviteShowAndTellGuest_/.test(source));

console.log(failures === 0 ? '\nSHOW & TELL GOOGLE AUTOMATIZACE: VŠE PROŠLO' : `\n${failures} TESTŮ AUTOMATIZACE SELHALO`);
process.exit(failures === 0 ? 0 : 1);
