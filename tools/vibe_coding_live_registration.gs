// Soukromá Calendar pozvánka a potvrzovací e-mail. Žádný veřejný export registrací.

const VIBE_CODING_LIVE = {
  formId: '1NE0ISDvtJ51sGkHSJPlodY3pOwyK8hrfhMFz-79ce60',
  eventTitle: 'Vibecoding s Alexem | Rozhovory Master the Flow #1',
  legacyEventTitle: 'Vibe coding nezačíná promptem — Master the Flow Live #1',
  eventStartMs: Date.parse('2026-10-21T16:00:00Z'),
  eventEndMs: Date.parse('2026-10-21T18:00:00Z'),
  emailQuestionTitles: ['E-mail', 'E‑mail'],
  confirmationMessage: 'Odpověď jsme přijali. Potvrzení s pozvánkou vám přijde e-mailem. Když zprávu nenajdete, zkontrolujte spam nebo napište na daniel@gamrot.cz.',
  activationProperty: 'VIBE_CODING_LIVE_ACTIVATED_AT',
  eventIdProperty: 'VIBE_CODING_LIVE_EVENT_ICAL_ID',
  streamUrlProperty: 'VIBE_CODING_LIVE_STREAM_URL',
  deliveryActivationProperty: 'VIBE_CODING_LIVE_EMAIL_ACTIVATED_AT',
  closedMessage: 'Registrace jsou nyní uzavřené. Děkujeme za zájem.',
  formDescription: 'Rozhovory Master the Flow · 1. díl\n21. října 2026, 18:00–20:00 · živé online vysílání · zdarma\n\n18:00–19:30 rozhovor, 19:30–20:00 otázky a odpovědi diváků.\n\nŽivý rozhovor Daniela Gamrota s Alexem Trejtnarem. Vibecoding vás učí každý. Přemýšlet málokdo.\n\nK registraci stačí e-mail. Ostatní otázky jsou nepovinné. Po registraci vám přijde potvrzení s odkazem na připojení a pozvánka do kalendáře. Záznam dostanou všichni registrovaní.\n\nÚdaje použiji pouze k organizaci této akce a zaslání záznamu. Odpovědi z formuláře se nebudou zveřejňovat. Formulář provozuje Google.',
};

function normalizeVibeCodingLiveEmail_(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) ? email : '';
}

// Jednorázová, opakovatelná aktivace. Neodesílá e-maily ani pozvánky a
// nemaže historický kapacitní ledger ani odmítací markery.
function activateVibeCodingUnlimitedRegistration() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const form = FormApp.openById(VIBE_CODING_LIVE.formId);
    form.setConfirmationMessage(VIBE_CODING_LIVE.confirmationMessage);
    form.setCustomClosedFormMessage(VIBE_CODING_LIVE.closedMessage);
    form.setAcceptingResponses(true);
    console.log(JSON.stringify({ acceptingResponses: form.isAcceptingResponses() }));
  } finally { lock.releaseLock(); }
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
  const eventId = PropertiesService.getScriptProperties().getProperty(VIBE_CODING_LIVE.eventIdProperty);
  if (eventId) {
    const event = calendar.getEventById(eventId);
    if (!event || event.getStartTime().getTime() !== VIBE_CODING_LIVE.eventStartMs) {
      throw new Error('Uložená Calendar událost chybí nebo má jiný začátek.');
    }
    return event;
  }
  // Jen migrace původní instalace; následně se používá uložené iCalUID.
  const windowStart = new Date(VIBE_CODING_LIVE.eventStartMs - 60 * 1000);
  const windowEnd = new Date(VIBE_CODING_LIVE.eventEndMs + 60 * 1000);
  const matches = calendar.getEvents(windowStart, windowEnd)
    .filter(event => [VIBE_CODING_LIVE.eventTitle, VIBE_CODING_LIVE.legacyEventTitle].indexOf(event.getTitle()) !== -1
      && event.getStartTime().getTime() === VIBE_CODING_LIVE.eventStartMs
      && [VIBE_CODING_LIVE.eventEndMs, Date.parse('2026-10-21T17:30:00Z')].indexOf(event.getEndTime().getTime()) !== -1);
  if (matches.length !== 1) {
    throw new Error('Očekávána právě jedna Calendar událost, nalezeno: ' + matches.length + '.');
  }
  return matches[0];
}

function protectVibeCodingLiveGuestPrivacy_(event) {
  event.setGuestsCanSeeGuests(false);
  event.setGuestsCanInviteOthers(false);
  event.setGuestsCanModify(false);
  event.setAnyoneCanAddSelf(false);
}

function vibeCodingLiveDeliveryKey_(response) {
  const id = response && typeof response.getId === 'function' ? response.getId() : '';
  if (!id) throw new Error('Chybí ID odpovědi; nelze bezpečně deduplikovat potvrzení.');
  return 'VIBE_CODING_LIVE_SENT_' + id;
}

function vibeCodingLiveStreamUrl_() {
  const url = PropertiesService.getScriptProperties().getProperty(VIBE_CODING_LIVE.streamUrlProperty) || '';
  if (!/^https:\/\/(?:www\.)?youtube\.com\/live\/[A-Za-z0-9_-]{11}(?:\?feature=share)?$/.test(url)) {
    throw new Error('Chybí platný neveřejný odkaz YouTube streamu v Script Properties.');
  }
  return url;
}

function inviteVibeCodingLiveGuest_(response) {
  const email = vibeCodingLiveEmailFromResponse_(response);
  const deliveryKey = vibeCodingLiveDeliveryKey_(response);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const cutover = Number(properties.getProperty(VIBE_CODING_LIVE.deliveryActivationProperty));
    if (!Number.isSafeInteger(cutover) || cutover <= 0) throw new Error('E-mailové doručování není aktivované.');
    if (response.getTimestamp().getTime() < cutover) return false;
    if (properties.getProperty(deliveryKey)) return false;
    // Starší odmítnutí před odstraněním limitu nereplayujeme. Nové registrace
    // už tento marker nevytvářejí a projdou bez kapacitní větve.
    if (properties.getProperty('VIBE_CODING_LIVE_FULL_' + response.getId())) return false;
    const event = vibeCodingLiveEvent_();
    if (event.getEndTime().getTime() !== VIBE_CODING_LIVE.eventEndMs) throw new Error('Calendar událost má nesprávný konec.');
    const streamUrl = vibeCodingLiveStreamUrl_();
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Denní limit e-mailů je vyčerpaný; registrace čeká na opakování.');
    protectVibeCodingLiveGuestPrivacy_(event);
    const alreadyInvited = event.getGuestList(true)
      .some(guest => normalizeVibeCodingLiveEmail_(guest.getEmail()) === email);
    if (!alreadyInvited) event.addGuest(email);
    // Členství v kalendáři není důkazem odeslaného potvrzení (zejména u pořadatele).
    MailApp.sendEmail({
      to: email,
      subject: 'Registrace potvrzena: Vibecoding s Alexem · 21. října v 18:00',
      body: 'Děkuji za registraci.\n\nVibecoding s Alexem\nStředa 21. října 2026, 18:00–20:00 (Praha)\n18:00–19:30 rozhovor\n19:30–20:00 otázky a odpovědi diváků\n\nŽivý stream na YouTube:\n' + streamUrl + '\n\nUdálost je připravená také v kalendáři. Odkaz na připojení si prosím uschovejte.\nZáznam dostanou všichni registrovaní.\n\nTěším se na viděnou.\nDaniel Gamrot\nMaster the Flow',
      name: 'Daniel Gamrot · Master the Flow',
    });
    // Zápis až po úspěšném odeslání. MailApp a Properties nejsou atomická transakce.
    properties.setProperty(deliveryKey, String(Date.now()));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function onVibeCodingLiveFormSubmit(event) {
  if (!event || !event.response || !event.source || event.source.getId() !== VIBE_CODING_LIVE.formId) {
    throw new Error('Trigger nedostal očekávanou novou odpověď formuláře.');
  }
  inviteVibeCodingLiveGuest_(event.response);
}

function reconcileVibeCodingLiveRegistrations() {
  const activationRaw = PropertiesService.getScriptProperties()
    .getProperty(VIBE_CODING_LIVE.activationProperty);
  const activationMs = Number(activationRaw);
  if (!Number.isSafeInteger(activationMs) || activationMs <= 0) {
    throw new Error('Chybí platný čas aktivace registrační automatizace.');
  }
  let failures = 0;
  FormApp.openById(VIBE_CODING_LIVE.formId).getResponses()
    .filter(response => response.getTimestamp().getTime() >= activationMs)
    .forEach(response => {
      try { inviteVibeCodingLiveGuest_(response); } catch (error) { failures++; }
    });
  if (failures) throw new Error('Nepodařilo se zpracovat ' + failures + ' registrací; zůstávají k opakování.');
}

// Migruje konfiguraci, ale neposílá zprávy ani nereplayuje existující odpovědi.
function prepareVibeCodingLiveDelivery() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    vibeCodingLiveStreamUrl_();
    MailApp.getRemainingDailyQuota(); // Vyžádá oprávnění i bez odeslání e-mailu.
    const properties = PropertiesService.getScriptProperties();
    const event = vibeCodingLiveEvent_();
    properties.setProperty(VIBE_CODING_LIVE.eventIdProperty, event.getId());
    protectVibeCodingLiveGuestPrivacy_(event);
    event.setTitle(VIBE_CODING_LIVE.eventTitle);
    event.setTime(new Date(VIBE_CODING_LIVE.eventStartMs), new Date(VIBE_CODING_LIVE.eventEndMs));
    event.setDescription('Živý rozhovor Daniela Gamrota s Alexem Trejtnarem.\n18:00–19:30 rozhovor, 19:30–20:00 otázky a odpovědi diváků.\nSetkání se nahrává; záznam dostanou všichni registrovaní.');
    const form = FormApp.openById(VIBE_CODING_LIVE.formId);
    form.setTitle(VIBE_CODING_LIVE.eventTitle);
    form.setDescription(VIBE_CODING_LIVE.formDescription);
    form.setConfirmationMessage(VIBE_CODING_LIVE.confirmationMessage);
    form.getItems().forEach(item => {
      if (item.getTitle() === 'Jméno a příjmení') item.asTextItem().setRequired(false);
    });
    if (!properties.getProperty(VIBE_CODING_LIVE.deliveryActivationProperty)) {
      properties.setProperty(VIBE_CODING_LIVE.deliveryActivationProperty, String(Date.now()));
    }
    console.log('Konfigurace aktualizována. Žádná pozvánka ani e-mail nebyly odeslány.');
  } finally { lock.releaseLock(); }
}

function installVibeCodingLiveRegistrationAutomation() {
  prepareVibeCodingLiveDelivery();
  const form = FormApp.openById(VIBE_CODING_LIVE.formId);
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty(VIBE_CODING_LIVE.activationProperty)) {
    properties.setProperty(VIBE_CODING_LIVE.activationProperty, String(Date.now()));
  }
  form.setConfirmationMessage(VIBE_CODING_LIVE.confirmationMessage);
  form.setCustomClosedFormMessage(VIBE_CODING_LIVE.closedMessage);
  form.setAcceptingResponses(true);
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
  // Instalace vědomě neposílá historické registrace.
}

function verifyVibeCodingLiveRegistrationAutomation() {
  const event = vibeCodingLiveEvent_();
  const managedHandlers = new Set(['onVibeCodingLiveFormSubmit', 'reconcileVibeCodingLiveRegistrations']);
  const managedTriggers = ScriptApp.getProjectTriggers()
    .filter(trigger => managedHandlers.has(trigger.getHandlerFunction()));
  const properties = PropertiesService.getScriptProperties();
  const result = {
    eventIdConfigured: !!properties.getProperty(VIBE_CODING_LIVE.eventIdProperty),
    correctTitle: event.getTitle() === VIBE_CODING_LIVE.eventTitle,
    correctEnd: event.getEndTime().getTime() === VIBE_CODING_LIVE.eventEndMs,
    streamConfigured: !!vibeCodingLiveStreamUrl_(),
    emailActivated: Number(properties.getProperty(VIBE_CODING_LIVE.deliveryActivationProperty)) > 0,
    remainingEmailQuota: MailApp.getRemainingDailyQuota(),
    responseSheetLinked: !!FormApp.openById(VIBE_CODING_LIVE.formId).getDestinationId(),
    anyoneCanAddSelf: event.anyoneCanAddSelf(),
    guestsCanInviteOthers: event.guestsCanInviteOthers(),
    guestsCanModify: event.guestsCanModify(),
    guestsCanSeeGuests: event.guestsCanSeeGuests(),
    acceptingResponses: FormApp.openById(VIBE_CODING_LIVE.formId).isAcceptingResponses(),
    managedTriggerCount: managedTriggers.length,
  };
  console.log(JSON.stringify(result));
  return result;
}
