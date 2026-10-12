const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const crypto = require('crypto');
const source = fs.readFileSync(path.join(__dirname, '../tools/vibe_coding_registration_count.gs'), 'utf8');
let emails = [' A@example.test ', 'a@example.test', 'b@example.test', '', 'invalid'];
let status = 200;
let secret = 'fixture-only';
let payload;
let releaseCount = 0;
const handlers = ['onVibeCodingLiveFormSubmit', 'reconcileVibeCodingLiveRegistrations'];
const properties = new Map([['VIBE_CODING_LIVE_SEATS_V1', '[]']]);
const form = { getId: () => '1NE0ISDvtJ51sGkHSJPlodY3pOwyK8hrfhMFz-79ce60', getResponses: () => emails.map(email => ({
  getId: () => email, getTimestamp: () => new Date(1000),
  getItemResponses: () => [{ getItem: () => ({ getTitle: () => 'E-mail' }), getResponse: () => email }],
})) };
const context = vm.createContext({ console: { log() {} }, FormApp: { openById: () => form },
  Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (algorithm, value) => [...crypto.createHash(algorithm).update(value).digest()] },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { releaseCount++; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: name => name === 'VIBE_CODING_SYNC_SECRET' ? secret : properties.get(name),
    setProperty: (name, value) => properties.set(name, value) }) },
  UrlFetchApp: { fetch(url, options) { assert.equal(url, 'https://mastertheflow.cz/api/vibe-coding-registrations'); payload = JSON.parse(options.payload); assert.equal(options.followRedirects, false); return { getResponseCode: () => status }; } },
  ScriptApp: {
    getProjectTriggers: () => handlers.map(handler => ({ getHandlerFunction: () => handler })),
    newTrigger: handler => ({
      forForm: () => ({ onFormSubmit: () => ({ create: () => handlers.push(handler) }) }),
      timeBased: () => ({ everyMinutes: minutes => { assert.equal(minutes, 5); return { create: () => handlers.push(handler) }; } }),
    }),
  },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../tools/vibe_coding_live_registration.gs'), 'utf8'), context);
vm.runInContext(source, context);
assert.equal(context.syncVibeCodingRegistrationCount(), 2);
assert.deepEqual(payload, { registeredCount: 2 });
emails = []; assert.equal(context.syncVibeCodingRegistrationCount(), 2, 'smazání odpovědi neuvolní přidělenou pozvánku');
properties.set('VIBE_CODING_LIVE_SEATS_V1', '[]');
assert.equal(context.syncVibeCodingRegistrationCount(), 0);
assert.deepEqual(payload, { registeredCount: 0 });
context.installVibeCodingCountSync(); context.installVibeCodingCountSync();
assert.deepEqual(handlers, ['onVibeCodingLiveFormSubmit', 'reconcileVibeCodingLiveRegistrations', 'onVibeCodingCountSubmit', 'syncVibeCodingRegistrationCount']);
assert.throws(() => context.onVibeCodingCountSubmit({ source: { getId: () => 'wrong' } }));
context.onVibeCodingCountSubmit({ source: form });
status = 503; assert.throws(() => context.syncVibeCodingRegistrationCount(), /503/);
secret = ''; assert.throws(() => context.syncVibeCodingRegistrationCount(), /konfigurace/);
assert.equal(releaseCount, 8);
assert.ok(!/MailApp|CalendarApp|deleteResponse|setAcceptingResponses|deleteTrigger/.test(source));
console.log('PASS: unikátní e-maily, prázdný stav, count-only payload, izolace pozvánek, idempotentní instalace, chyby');
