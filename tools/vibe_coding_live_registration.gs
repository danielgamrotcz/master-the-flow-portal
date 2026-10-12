// Registrace Master the Flow Live #1: soukromá Calendar pozvánka bez veřejného exportu e-mailů.

const VIBE_CODING_LIVE = {
  formId: '1NE0ISDvtJ51sGkHSJPlodY3pOwyK8hrfhMFz-79ce60',
  eventTitle: 'Vibe coding nezačíná promptem — Master the Flow Live #1',
  eventStartMs: Date.parse('2026-10-21T16:00:00Z'),
  eventEndMs: Date.parse('2026-10-21T17:30:00Z'),
  emailQuestionTitles: ['E-mail', 'E‑mail'],
  confirmationMessage: 'Děkuji, registrace je hotová. Pozvánka do kalendáře s odkazem na Google Meet vám přijde e-mailem. Pokud ji nenajdete, zkontrolujte spam nebo napište na daniel@gamrot.cz. Těším se 21. října v 18:00. Záznam dostanou všichni registrovaní.',
  activationProperty: 'VIBE_CODING_LIVE_ACTIVATED_AT',
};

function normalizeVibeCodingLiveEmail_(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function vibeCodingLiveEmailFromResponse_(response) {
  const itemResponses = response && typeof response.getItemResponses === 'function'
    ? response.getItemResponses()
    : [];
  for (const itemResponse of itemResponses) {
    const title = itemResponse.getItem().getTitle();
    if (VIBE_CODING_LIVE.emailQuestionTitles.indexOf(title) !== -1) {
      const email = normalizeVibeCodingLiveEmail_(itemResponse.getResponse());
      if (email) return email;
    }
  }
  throw new Error('V nové odpovědi chybí platný e-mail.');
}

function vibeCodingLiveEvent_() {
  const calendar = CalendarApp.getDefaultCalendar();
  const windowStart = new Date(VIBE_CODING_LIVE.eventStartMs - 60 * 1000);
  const windowEnd = new Date(VIBE_CODING_LIVE.eventEndMs + 60 * 1000);
  const matches = calendar.getEvents(windowStart, windowEnd)
    .filter(event => event.getTitle() === VIBE_CODING_LIVE.eventTitle
      && event.getStartTime().getTime() === VIBE_CODING_LIVE.eventStartMs
      && event.getEndTime().getTime() === VIBE_CODING_LIVE.eventEndMs);
  if (matches.length !== 1) {
    throw new Error(`Očekávána právě jedna Calendar událost, nalezeno: ${matches.length}.`);
  }
  return matches[0];
}

function protectVibeCodingLiveGuestPrivacy_(event) {
  event.setGuestsCanSeeGuests(false);
  event.setGuestsCanInviteOthers(false);
  event.setGuestsCanModify(false);
  event.setAnyoneCanAddSelf(false);
}

function inviteVibeCodingLiveGuest_(email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const event = vibeCodingLiveEvent_();
    protectVibeCodingLiveGuestPrivacy_(event);
    const alreadyInvited = event.getGuestList(true)
      .some(guest => normalizeVibeCodingLiveEmail_(guest.getEmail()) === email);
    if (!alreadyInvited) event.addGuest(email);
    return !alreadyInvited;
  } finally {
    lock.releaseLock();
  }
}

function onVibeCodingLiveFormSubmit(event) {
  if (!event || !event.response || !event.source || event.source.getId() !== VIBE_CODING_LIVE.formId) {
    throw new Error('Trigger nedostal očekávanou novou odpověď formuláře.');
  }
  inviteVibeCodingLiveGuest_(vibeCodingLiveEmailFromResponse_(event.response));
}

function reconcileVibeCodingLiveRegistrations() {
  const activationRaw = PropertiesService.getScriptProperties()
    .getProperty(VIBE_CODING_LIVE.activationProperty);
  const activationMs = Number(activationRaw);
  if (!Number.isSafeInteger(activationMs) || activationMs <= 0) {
    throw new Error('Chybí platný čas aktivace registrační automatizace.');
  }
  FormApp.openById(VIBE_CODING_LIVE.formId).getResponses()
    .filter(response => response.getTimestamp().getTime() >= activationMs)
    .forEach(response => inviteVibeCodingLiveGuest_(vibeCodingLiveEmailFromResponse_(response)));
}

function installVibeCodingLiveRegistrationAutomation() {
  const form = FormApp.openById(VIBE_CODING_LIVE.formId);
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty(VIBE_CODING_LIVE.activationProperty)) {
    properties.setProperty(VIBE_CODING_LIVE.activationProperty, String(Date.now()));
  }
  form.setConfirmationMessage(VIBE_CODING_LIVE.confirmationMessage);
  protectVibeCodingLiveGuestPrivacy_(vibeCodingLiveEvent_());

  const managedHandlers = new Set([
    'onVibeCodingLiveFormSubmit',
    'reconcileVibeCodingLiveRegistrations',
  ]);
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (managedHandlers.has(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('onVibeCodingLiveFormSubmit').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('reconcileVibeCodingLiveRegistrations').timeBased().everyHours(6).create();
  reconcileVibeCodingLiveRegistrations();
}

function verifyVibeCodingLiveRegistrationAutomation() {
  const event = vibeCodingLiveEvent_();
  const managedHandlers = new Set(['onVibeCodingLiveFormSubmit', 'reconcileVibeCodingLiveRegistrations']);
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
