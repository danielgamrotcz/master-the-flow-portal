// Synchronizace přidělených míst. Při naplnění zavře formulář; neposílá pozvánky.
const VIBE_COUNT = {
  formId: '1NE0ISDvtJ51sGkHSJPlodY3pOwyK8hrfhMFz-79ce60',
  endpoint: 'https://mastertheflow.cz/api/vibe-coding-registrations',
  secretProperty: 'VIBE_CODING_SYNC_SECRET',
};

function syncVibeCodingRegistrationCount() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const reserved = refreshVibeCodingSeatsLocked_(FormApp.openById(VIBE_COUNT.formId));
    const secret = PropertiesService.getScriptProperties().getProperty(VIBE_COUNT.secretProperty);
    if (!secret) throw new Error('Chybí konfigurace synchronizace počtu.');
    const result = UrlFetchApp.fetch(VIBE_COUNT.endpoint, {
      method: 'post', contentType: 'application/json',
      headers: { 'x-attendees-secret': secret },
      payload: JSON.stringify({ registeredCount: reserved.size }),
      muteHttpExceptions: true, followRedirects: false,
    });
    if (result.getResponseCode() !== 200) throw new Error('Synchronizace počtu selhala: HTTP ' + result.getResponseCode());
    console.log('Synchronizováno přidělených míst: ' + reserved.size);
    return reserved.size;
  } finally { lock.releaseLock(); }
}

function onVibeCodingCountSubmit(event) {
  if (!event || !event.source || event.source.getId() !== VIBE_COUNT.formId) throw new Error('Neočekávaný formulář.');
  return syncVibeCodingRegistrationCount();
}

function installVibeCodingCountSync() {
  // Nejprve ověří oprávnění, konfiguraci a dostupnost cíle. Bez e-mailů.
  syncVibeCodingRegistrationCount();
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(trigger => trigger.getHandlerFunction() === 'onVibeCodingCountSubmit')) {
    ScriptApp.newTrigger('onVibeCodingCountSubmit').forForm(FormApp.openById(VIBE_COUNT.formId)).onFormSubmit().create();
  }
  if (!triggers.some(trigger => trigger.getHandlerFunction() === 'syncVibeCodingRegistrationCount')) {
    ScriptApp.newTrigger('syncVibeCodingRegistrationCount').timeBased().everyMinutes(5).create();
  }
  console.log('Počet: při registraci a každých 5 minut. Pozvánkové triggery beze změny.');
}
