const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../tools/vibe_coding_registration_count.gs'), 'utf8');
let emails = [' A@example.test ', 'a@example.test', 'b@example.test', '', 'invalid'];
let status = 200;
let secret = 'fixture-only';
let payload;
let releaseCount = 0;
const handlers = ['onVibeCodingLiveFormSubmit', 'reconcileVibeCodingLiveRegistrations'];
const form = { getId: () => '1NE0ISDvtJ51sGkHSJPlodY3pOwyK8hrfhMFz-79ce60', getResponses: () => emails.map(email => ({
  getItemResponses: () => [{ getItem: () => ({ getTitle: () => 'E-mail' }), getResponse: () => email }],
})) };
const context = vm.createContext({ console: { log() {} }, FormApp: { openById: () => form },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { releaseCount++; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => secret }) },
  UrlFetchApp: { fetch(url, options) { assert.equal(url, 'https://mastertheflow.cz/api/vibe-coding-registrations'); payload = JSON.parse(options.payload); assert.equal(options.followRedirects, false); return { getResponseCode: () => status }; } },
  ScriptApp: {
    getProjectTriggers: () => handlers.map(handler => ({ getHandlerFunction: () => handler })),
    newTrigger: handler => ({
      forForm: () => ({ onFormSubmit: () => ({ create: () => handlers.push(handler) }) }),
      timeBased: () => ({ everyMinutes: minutes => { assert.equal(minutes, 5); return { create: () => handlers.push(handler) }; } }),
    }),
  },
});
vm.runInContext(source, context);
assert.equal(context.syncVibeCodingRegistrationCount(), 2);
assert.deepEqual(payload, { registeredCount: 2 });
emails = []; assert.equal(context.syncVibeCodingRegistrationCount(), 0);
assert.deepEqual(payload, { registeredCount: 0 });
context.installVibeCodingCountSync(); context.installVibeCodingCountSync();
assert.deepEqual(handlers, ['onVibeCodingLiveFormSubmit', 'reconcileVibeCodingLiveRegistrations', 'onVibeCodingCountSubmit', 'syncVibeCodingRegistrationCount']);
assert.throws(() => context.onVibeCodingCountSubmit({ source: { getId: () => 'wrong' } }));
context.onVibeCodingCountSubmit({ source: form });
status = 503; assert.throws(() => context.syncVibeCodingRegistrationCount(), /503/);
secret = ''; assert.throws(() => context.syncVibeCodingRegistrationCount(), /konfigurace/);
assert.equal(releaseCount, 7);
assert.ok(!/MailApp|CalendarApp|deleteResponse|setAcceptingResponses|deleteTrigger/.test(source));
console.log('PASS: unikátní e-maily, prázdný stav, count-only payload, izolace pozvánek, idempotentní instalace, chyby');
