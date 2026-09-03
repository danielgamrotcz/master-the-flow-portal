// Nové registrace Show & Tell: soukromá Calendar pozvánka a anonymní počet pro web.
// E-mail zůstává uvnitř Google Workspace a nikdy není součástí webhook payloadu.

const SHOW_AND_TELL = {
  formId: '1UZC9CuzpTSxeLC-wi8q4tklMm3nINzXzDVEn3ViE5yA',
  eventTitle: 'AI, která mi fakt funguje — online Show & Tell',
  eventStartMs: Date.parse('2026-09-22T16:00:00Z'),
  eventEndMs: Date.parse('2026-09-22T17:30:00Z'),
  webhookUrl: 'https://master-the-flow-portal.pages.dev/api/show-and-tell-registrations',
  emailQuestionTitles: ['E-mail', 'E‑mail'],
  confirmationMessage: 'Díky, s vaší účastí počítám. Pozvánku do kalendáře s odkazem na online setkání pošlu na e-mail uvedený ve formuláři. Pokud jste nabídli ukázku, ozvu se vám po výběru 5–6 příspěvků. Když se váš plán změní, upravte odpověď přes odkaz po odeslání.',
};

function normalizeShowAndTellEmail_(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function showAndTellEmailFromResponse_(response) {
  const itemResponses = response && typeof response.getItemResponses === 'function'
    ? response.getItemResponses()
    : [];
  for (const itemResponse of itemResponses) {
    const title = itemResponse.getItem().getTitle();
    if (SHOW_AND_TELL.emailQuestionTitles.indexOf(title) !== -1) {
      return normalizeShowAndTellEmail_(itemResponse.getResponse());
    }
  }
  throw new Error('V nové odpovědi chybí platný e-mail.');
}

function showAndTellEvent_() {
  const calendar = CalendarApp.getDefaultCalendar();
  const windowStart = new Date(SHOW_AND_TELL.eventStartMs - 60 * 1000);
  const windowEnd = new Date(SHOW_AND_TELL.eventEndMs + 60 * 1000);
  const matches = calendar.getEvents(windowStart, windowEnd)
    .filter(event => event.getTitle() === SHOW_AND_TELL.eventTitle
      && event.getStartTime().getTime() === SHOW_AND_TELL.eventStartMs
      && event.getEndTime().getTime() === SHOW_AND_TELL.eventEndMs);
  if (matches.length !== 1) {
    throw new Error(`Očekávána právě jedna Calendar událost, nalezeno: ${matches.length}.`);
  }
  return matches[0];
}

function protectShowAndTellGuestPrivacy_(event) {
  event.setGuestsCanSeeGuests(false);
  event.setGuestsCanInviteOthers(false);
  event.setGuestsCanModify(false);
  event.setAnyoneCanAddSelf(false);
}

function inviteShowAndTellGuest_(email) {
  const event = showAndTellEvent_();
  protectShowAndTellGuestPrivacy_(event);
  const alreadyInvited = event.getGuestList(true)
    .some(guest => normalizeShowAndTellEmail_(guest.getEmail()) === email);
  if (!alreadyInvited) event.addGuest(email);
  return !alreadyInvited;
}

function syncShowAndTellRegistrationCount() {
  const uniqueEmails = new Set(FormApp.openById(SHOW_AND_TELL.formId).getResponses()
    .map(response => showAndTellEmailFromResponse_(response)));
  const count = uniqueEmails.size;
  if (!PropertiesService.getScriptProperties().getProperty('SHOW_AND_TELL_SYNC_SECRET')) {
    throw new Error('Chybí Script Property SHOW_AND_TELL_SYNC_SECRET.');
  }
  const response = UrlFetchApp.fetch(SHOW_AND_TELL.webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-attendees-secret': PropertiesService.getScriptProperties()
        .getProperty('SHOW_AND_TELL_SYNC_SECRET'),
    },
    payload: JSON.stringify({ registeredCount: count }),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error(`Synchronizace počtu selhala: HTTP ${status}.`);
  return count;
}

function onShowAndTellFormSubmit(event) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!event || !event.response || !event.source || event.source.getId() !== SHOW_AND_TELL.formId) {
      throw new Error('Trigger nedostal očekávanou novou odpověď formuláře.');
    }
    const email = showAndTellEmailFromResponse_(event.response);
    const errors = [];
    try {
      inviteShowAndTellGuest_(email);
    } catch (error) {
      errors.push(`pozvánka: ${error.message}`);
    }
    try {
      syncShowAndTellRegistrationCount();
    } catch (error) {
      errors.push(`počet: ${error.message}`);
    }
    if (errors.length) throw new Error(errors.join('; '));
  } finally {
    lock.releaseLock();
  }
}

function installShowAndTellRegistrationAutomation() {
  const form = FormApp.openById(SHOW_AND_TELL.formId);
  form.setConfirmationMessage(SHOW_AND_TELL.confirmationMessage);
  protectShowAndTellGuestPrivacy_(showAndTellEvent_());

  const managedHandlers = new Set(['onShowAndTellFormSubmit', 'syncShowAndTellRegistrationCount']);
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (managedHandlers.has(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('onShowAndTellFormSubmit').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('syncShowAndTellRegistrationCount').timeBased().everyHours(6).create();
  return syncShowAndTellRegistrationCount();
}

function verifyShowAndTellRegistrationAutomation() {
  const event = showAndTellEvent_();
  const managedHandlers = new Set(['onShowAndTellFormSubmit', 'syncShowAndTellRegistrationCount']);
  const managedTriggers = ScriptApp.getProjectTriggers()
    .filter(trigger => managedHandlers.has(trigger.getHandlerFunction()));
  return {
    anyoneCanAddSelf: event.anyoneCanAddSelf(),
    guestsCanInviteOthers: event.guestsCanInviteOthers(),
    guestsCanModify: event.guestsCanModify(),
    guestsCanSeeGuests: event.guestsCanSeeGuests(),
    managedTriggerCount: managedTriggers.length,
  };
}
