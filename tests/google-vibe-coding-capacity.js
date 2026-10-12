// Trvalý invariant: nejvýše 98 unikátních míst, žádný Meet/Calendar pro přesah.
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert/strict');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../tools/vibe_coding_live_registration.gs'), 'utf8');
const countSource = fs.readFileSync(path.join(__dirname, '../tools/vibe_coding_registration_count.gs'), 'utf8');
const response = (email, id) => ({ getId: () => String(id), getTimestamp: () => new Date(1000 + Number(id)),
  getItemResponses: () => [{ getItem: () => ({ getTitle: () => 'E-mail' }), getResponse: () => email }] });
let responses = [];
let locked = false;
let accepting = true;
let sent = [];
let guests = [];
let failMail = false;
let failWrite = false;
let httpStatus = 200;
let published;
const properties = new Map([
  ['VIBE_CODING_LIVE_EMAIL_ACTIVATED_AT', '1'], ['VIBE_CODING_LIVE_EVENT_ICAL_ID', 'fixture'],
  ['VIBE_CODING_LIVE_MEET_URL', 'https://meet.google.com/aaa-bbbb-ccc'],
  ['VIBE_CODING_SYNC_SECRET', 'fixture-only'],
]);
const form = { getId: () => 'fixture-form', getResponses: () => [...responses],
  setConfirmationMessage() {}, setCustomClosedFormMessage() {},
  setAcceptingResponses(value) { assert.equal(locked, true); assert.equal(value, false); accepting = value; },
  isAcceptingResponses: () => accepting,
};
const event = {
  getStartTime: () => new Date('2026-10-21T16:00:00Z'), getEndTime: () => new Date('2026-10-21T18:00:00Z'),
  getGuestList: () => guests.map(email => ({ getEmail: () => email })),
  addGuest(email) { assert.ok(locked); guests.push(email); },
  setGuestsCanSeeGuests() {}, setGuestsCanInviteOthers() {}, setGuestsCanModify() {}, setAnyoneCanAddSelf() {},
};
const context = vm.createContext({ console: { log() {} }, FormApp: { openById: () => form },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key),
    setProperty(key, value) { assert.ok(locked); if (failWrite) throw new Error('write failed'); properties.set(key, value); } }) },
  Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (algorithm, text) => [...crypto.createHash(algorithm).update(text).digest()] },
  LockService: { getScriptLock: () => ({ waitLock() { assert.equal(locked, false); locked = true; }, releaseLock() { locked = false; } }) },
  CalendarApp: { getDefaultCalendar: () => ({ getEventById: () => event }) },
  MailApp: { getRemainingDailyQuota: () => 1000, sendEmail(message) { assert.ok(locked); if (failMail) throw new Error('mail failed'); sent.push(message); } },
  UrlFetchApp: { fetch(url, options) { published = JSON.parse(options.payload); return { getResponseCode: () => httpStatus }; } },
});
vm.runInContext(source + '\n' + countSource, context);
const seats = () => JSON.parse(properties.get('VIBE_CODING_LIVE_SEATS_V1'));
const invite = item => context.inviteVibeCodingLiveGuest_(item);
responses = Array.from({ length: 97 }, (_, i) => response(`person${i}@example.test`, i));
context.activateVibeCodingCapacity();
assert.equal(seats().length, 97); assert.equal(sent.length, 0); assert.equal(accepting, true);
responses.push(response(' PERSON0@example.test ', 100));
context.syncVibeCodingRegistrationCount(); assert.equal(seats().length, 97);
// Současně dostupných více odpovědí, opačné pořadí doručení triggerů.
const last = response('last@example.test', 101);
const overflow = response('overflow@example.test', 102);
responses.push(last, overflow);
assert.equal(invite(overflow), false);
assert.equal(accepting, false); assert.equal(seats().length, 98);
assert.equal(guests.length, 0); assert.equal(sent.length, 1);
assert.ok(!sent[0].body.includes('meet.google.com'));
assert.ok(!sent[0].subject.includes('potvrzena'));
invite(overflow); assert.equal(sent.length, 1, 'odmítnutí se neduplikuje');
invite(last); assert.equal(guests.length, 1); assert.ok(sent[1].body.includes('meet.google.com'));
invite(last); assert.equal(sent.length, 2);
assert.equal(seats().length, 98);
assert.ok(!properties.get('VIBE_CODING_LIVE_SEATS_V1').includes('@'));
assert.ok(Buffer.byteLength(properties.get('VIBE_CODING_LIVE_SEATS_V1')) < 9000);
// Zámek musí před zápisem zastavit druhý souběžný handler.
locked = true; assert.throws(() => invite(response('parallel@example.test', 103))); locked = false;
responses = [overflow];
context.syncVibeCodingRegistrationCount(); assert.deepEqual(published, { registeredCount: 98 });
assert.equal(seats().length, 98, 'smazání odpovědi neuvolní místo');
accepting = true; httpStatus = 503;
assert.throws(() => context.syncVibeCodingRegistrationCount());
assert.equal(accepting, false, 'uzavření nečeká na dostupnost webu');
httpStatus = 200;
// Retry po chybě e-mailu zachová stejné místo.
failMail = true; assert.throws(() => invite(response('last@example.test', 104)));
assert.equal(seats().length, 98); failMail = false;
invite(response('last@example.test', 104)); assert.equal(guests.length, 1);
// Chybějící/poškozený ledger nikdy neotevře fallback bez limitu.
const validLedger = properties.get('VIBE_CODING_LIVE_SEATS_V1');
for (const raw of [undefined, '{bad', '{}', '["bad"]']) {
  properties.set('VIBE_CODING_LIVE_SEATS_V1', raw);
  assert.throws(() => invite(response('new@example.test', 105)));
  assert.equal(locked, false);
}
properties.set('VIBE_CODING_LIVE_SEATS_V1', validLedger);
const before = sent.length; context.activateVibeCodingCapacity(); assert.equal(sent.length, before);
assert.equal(seats().length, 98, 'aktivace nikdy neresetuje ledger');
// Migrace již přeplněných registrací vyžaduje člověka, ne tichý ořez.
properties.delete('VIBE_CODING_LIVE_SEATS_V1');
responses = Array.from({ length: 99 }, (_, i) => response(`new${i}@example.test`, i));
assert.throws(() => context.activateVibeCodingCapacity(), /překračují/);
assert.equal(properties.has('VIBE_CODING_LIVE_SEATS_V1'), false);
responses = [response('new@example.test', 1)]; failWrite = true;
assert.throws(() => context.activateVibeCodingCapacity()); assert.equal(locked, false);
assert.equal(context.normalizeVibeCodingLiveEmail_('first,second@example.test'), '');
// Sto uložených odpovědí, triggery doručené v opačném pořadí: přesně 98 pozvánek.
failWrite = false; sent = []; guests = []; accepting = true;
properties.set('VIBE_CODING_LIVE_SEATS_V1', '[]');
responses = Array.from({ length: 100 }, (_, i) => response(`batch${i}@example.test`, 200 + i));
for (const item of [...responses].reverse()) invite(item);
assert.equal(guests.length, 98);
assert.equal(new Set(guests).size, 98);
assert.equal(sent.filter(message => message.body.includes('meet.google.com')).length, 98);
assert.equal(sent.filter(message => !message.body.includes('meet.google.com')).length, 2);
assert.equal(seats().length, 98); assert.equal(accepting, false);
console.log('PASS: limit97/98/99, pořadí, duplicity, zámek, odmítnutí bez Meet, retry, uzavření při HTTP chybě, trvalost a fail-closed migrace');
