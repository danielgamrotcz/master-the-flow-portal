// Synchronizace veřejného seznamu účastníků z Google Formuláře do Cloudflare KV.
// Skript neposílá e-maily ani odpovědi bez výslovného souhlasu. E-mail zadaný
// respondentem používá pouze uvnitř formuláře k deduplikaci registrací.

const ATTENDEE_SYNC = Object.freeze({
  formId: '17-Nq5w_Ean8iaHNQNBmZxRFvft9a4XUCxxr-StVCqvU',
  webhookUrl: 'https://master-the-flow-portal.pages.dev/api/meetup-attendees',
  publishUntil: new Date('2026-09-06T21:59:59Z'),
  questions: Object.freeze({
    name: 'Jméno a příjmení',
    bio: 'Pár vět o vás',
    attendance: 'Jak to zatím vidíte s účastí?',
    consent: 'Zveřejnění na stránce srazu',
  }),
  consentYes: 'Souhlasím se zveřejněním mého jména, popisu a rozsahu účasti',
});

function attendeeAnswers_(response) {
  const answers = {};
  response.getItemResponses().forEach(itemResponse => {
    answers[itemResponse.getItem().getTitle()] = itemResponse.getResponse();
  });
  return answers;
}

function attendeeType_(answer) {
  const mapping = {
    'Dorazím na oficiální část 13:00–18:00': 'official',
    'Dorazím na oficiální část i na společný piknik po 18:00': 'official_and_picnic',
    'Přijdu jen na piknik po 18:00': 'picnic_only',
    'Zatím nevím přesně': 'uncertain',
  };
  return mapping[String(answer || '').trim()] || 'uncertain';
}

function attendeePayload_() {
  if (new Date() > ATTENDEE_SYNC.publishUntil) return [];
  const responses = FormApp.openById(ATTENDEE_SYNC.formId).getResponses();
  const byEmail = new Map();

  responses.forEach(response => {
    const answers = attendeeAnswers_(response);
    // Formulář musí sbírat e-mail volbou „Zadání od respondentů“. Přihlášení
    // ke Google účtu se nevyžaduje; e-mail zůstává pouze interním klíčem.
    const email = String(response.getRespondentEmail() || '').trim().toLowerCase();
    if (!email) return;
    if (answers[ATTENDEE_SYNC.questions.consent] !== ATTENDEE_SYNC.consentYes) {
      byEmail.delete(email);
      return;
    }
    const name = String(answers[ATTENDEE_SYNC.questions.name] || '').trim();
    const bio = String(answers[ATTENDEE_SYNC.questions.bio] || '').trim();
    if (!name || !bio) return;
    byEmail.set(email, {
      consent: true,
      name,
      bio,
      attendance: attendeeType_(answers[ATTENDEE_SYNC.questions.attendance]),
    });
  });

  return [...byEmail.values()];
}

function syncAttendees() {
  const secret = PropertiesService.getScriptProperties().getProperty('ATTENDEES_SYNC_SECRET');
  if (!secret) throw new Error('Chybí Script Property ATTENDEES_SYNC_SECRET.');
  const attendees = attendeePayload_();
  const response = UrlFetchApp.fetch(ATTENDEE_SYNC.webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-attendees-secret': secret },
    payload: JSON.stringify({ attendees }),
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error(`Synchronizace selhala: HTTP ${code}`);
  if (new Date() > ATTENDEE_SYNC.publishUntil) removeAttendeeSyncTriggers_();
}

function installAttendeeSync() {
  removeAttendeeSyncTriggers_();
  const form = FormApp.openById(ATTENDEE_SYNC.formId);
  ScriptApp.newTrigger('syncAttendees').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('syncAttendees').timeBased().everyHours(6).create();
  syncAttendees();
}

function removeAttendeeSyncTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'syncAttendees')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}
