// Trvalý invariant: registrační automatizace nemá pevný limit a nezavírá formulář podle počtu.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../tools/vibe_coding_live_registration.gs'), 'utf8');
const countSource = fs.readFileSync(path.join(__dirname, '../tools/vibe_coding_registration_count.gs'), 'utf8');
const response = (email, id) => ({
  getId: () => String(id),
  getTimestamp: () => new Date(1000 + Number(id)),
  getItemResponses: () => [{ getItem: () => ({ getTitle: () => 'E-mail' }), getResponse: () => email }],
});

let responses = [];
let locked = false;
let accepting = false;
let sent = [];
let guests = [];
let failMail = false;
let published;
let confirmation = '';
let closedMessage = '';
const legacyLedger = JSON.stringify(['legacy-hash']);
const properties = new Map([
  ['VIBE_CODING_LIVE_EMAIL_ACTIVATED_AT', '1'],
  ['VIBE_CODING_LIVE_EVENT_ICAL_ID', 'fixture'],
  ['VIBE_CODING_LIVE_MEET_URL', 'https://meet.google.com/aaa-bbbb-ccc'],
  ['VIBE_CODING_SYNC_SECRET', 'fixture-only'],
  ['VIBE_CODING_LIVE_ACTIVATED_AT', '1'],
  ['VIBE_CODING_LIVE_SEATS_V1', legacyLedger],
  ['VIBE_CODING_LIVE_FULL_199', 'historical-decline'],
]);

const form = {
  getId: () => 'fixture-form',
  getResponses: () => [...responses],
  setConfirmationMessage(value) { confirmation = value; },
  setCustomClosedFormMessage(value) { closedMessage = value; },
  setAcceptingResponses(value) { assert.equal(locked, true); accepting = value; },
  isAcceptingResponses: () => accepting,
};
const event = {
  getStartTime: () => new Date('2026-10-21T16:00:00Z'),
  getEndTime: () => new Date('2026-10-21T18:00:00Z'),
  getGuestList: () => guests.map(email => ({ getEmail: () => email })),
  addGuest(email) { assert.ok(locked); guests.push(email); },
  setGuestsCanSeeGuests() {}, setGuestsCanInviteOthers() {}, setGuestsCanModify() {}, setAnyoneCanAddSelf() {},
};
const context = vm.createContext({
  console: { log() {} },
  FormApp: { openById: () => form },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: key => properties.get(key),
    setProperty(key, value) { assert.ok(locked); properties.set(key, value); },
  }) },
  LockService: { getScriptLock: () => ({
    waitLock() { assert.equal(locked, false); locked = true; },
    releaseLock() { locked = false; },
  }) },
  CalendarApp: { getDefaultCalendar: () => ({ getEventById: () => event }) },
  MailApp: {
    getRemainingDailyQuota: () => 1000,
    sendEmail(message) { assert.ok(locked); if (failMail) throw new Error('mail failed'); sent.push(message); },
  },
  UrlFetchApp: { fetch(url, options) { published = JSON.parse(options.payload); return { getResponseCode: () => 200 }; } },
});
vm.runInContext(source + '\n' + countSource, context);

const invite = item => context.inviteVibeCodingLiveGuest_(item);
const historicalDecline = response('declined@example.test', 199);
responses = [historicalDecline, ...Array.from({ length: 101 }, (_, i) => response(`person${i}@example.test`, 200 + i))];
assert.equal(invite(historicalDecline), false, 'historicky odmítnutá odpověď se nereplayuje');
for (const item of [...responses.slice(1)].reverse()) assert.equal(invite(item), true);
assert.equal(guests.length, 101);
assert.equal(new Set(guests).size, 101);
assert.equal(sent.length, 101);
assert.ok(sent.every(message => message.body.includes('meet.google.com')));
assert.equal(accepting, false, 'pozvánkový trigger nemění stav formuláře');

invite(responses[99]);
assert.equal(sent.length, 101, 'opakovaný trigger neduplikuje potvrzení');
assert.equal(properties.get('VIBE_CODING_LIVE_SEATS_V1'), legacyLedger, 'historický ledger zůstává inertní');
assert.equal(properties.get('VIBE_CODING_LIVE_FULL_199'), 'historical-decline', 'historický marker se nemaže');
context.reconcileVibeCodingLiveRegistrations();
assert.equal(sent.filter(message => message.to === 'declined@example.test').length, 0, 'reconciliation staré odmítnutí nepřehraje');

context.activateVibeCodingUnlimitedRegistration();
assert.equal(accepting, true);
assert.ok(!/98|kapacit|obsazen/i.test(confirmation));
assert.ok(!/98|kapacit|obsazen/i.test(closedMessage));
assert.equal(properties.get('VIBE_CODING_LIVE_SEATS_V1'), legacyLedger);
assert.equal(sent.length, 101, 'aktivace nic nerozesílá');

context.syncVibeCodingRegistrationCount();
assert.deepEqual(published, { registeredCount: 101 });
responses = [responses[1]];
context.syncVibeCodingRegistrationCount();
assert.deepEqual(published, { registeredCount: 1 }, 'aktuální počet po smazání klesne');

failMail = true;
const retry = response('retry@example.test', 400);
assert.throws(() => invite(retry), /mail failed/);
failMail = false;
assert.equal(invite(retry), true);
assert.equal(sent.filter(message => message.to === 'retry@example.test').length, 1);

locked = true;
assert.throws(() => invite(response('parallel@example.test', 401)));
locked = false;
assert.equal(context.normalizeVibeCodingLiveEmail_('first,second@example.test'), '');
assert.ok(!/capacity\s*:\s*98|živá kapacita je naplněná|všech 98 míst/i.test(source));
assert.ok(/VIBE_CODING_LIVE_FULL_/.test(source), 'historický marker chrání před replayem');
assert.ok(!/setAcceptingResponses|setCustomClosedFormMessage/.test(countSource));
console.log('PASS: 101 registrací, žádný pevný limit, aktivní CTA formuláře, inertní ledger, aktuální count, deduplikace a retry');
