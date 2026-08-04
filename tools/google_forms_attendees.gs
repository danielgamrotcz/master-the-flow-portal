// Synchronizace veřejného seznamu účastníků z Google Formuláře do Cloudflare KV.
// Skript neposílá e-maily ani odpovědi bez výslovného souhlasu. E-mail zadaný
// respondentem používá pouze uvnitř formuláře k deduplikaci registrací.

const ATTENDEE_SYNC = Object.freeze({
  formId: '17-Nq5w_Ean8iaHNQNBmZxRFvft9a4XUCxxr-StVCqvU',
  webhookUrl: 'https://master-the-flow-portal.pages.dev/api/meetup-attendees',
  publishUntil: new Date('2026-09-06T21:59:59Z'),
  maxPublicBioLength: 1200,
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

function publicBio_(value) {
  const bio = String(value || '').trim();
  if (bio.length <= ATTENDEE_SYNC.maxPublicBioLength) return bio;
  // Nechat místo pro výpustku a nerozdělit emoji uprostřed surrogate pairu.
  const shortened = bio.slice(0, ATTENDEE_SYNC.maxPublicBioLength - 1)
    .replace(/[\uD800-\uDBFF]$/, '');
  return `${shortened}…`;
}

function attendeeEmail_(response, answers) {
  const respondentEmail = String(response.getRespondentEmail() || '').trim();
  if (respondentEmail) return respondentEmail.toLowerCase();

  // Bez přihlášení ke Google účtu Forms nevyplní getRespondentEmail(), ale
  // adresu vrátí jako běžnou odpověď. Podporujeme i typografickou pomlčku v
  // názvu otázky „E-mail“; e-mail zůstává pouze interním klíčem.
  const manualEmail = Object.entries(answers).find(([title]) => (
    String(title).replace(/[\s\u2010-\u2015-]/g, '').toLowerCase() === 'email'
  ));
  return String(manualEmail ? manualEmail[1] : '').trim().toLowerCase();
}

function attendeePayload_() {
  if (new Date() > ATTENDEE_SYNC.publishUntil) return { attendees: [], registeredCount: 0 };
  const responses = FormApp.openById(ATTENDEE_SYNC.formId).getResponses();
  const byEmail = new Map();
  const registrationsByEmail = new Map();

  responses.forEach(response => {
    const answers = attendeeAnswers_(response);
    const email = attendeeEmail_(response, answers);
    if (!email) return;
    registrationsByEmail.set(email, true);
    if (answers[ATTENDEE_SYNC.questions.consent] !== ATTENDEE_SYNC.consentYes) {
      byEmail.delete(email);
      return;
    }
    const name = String(answers[ATTENDEE_SYNC.questions.name] || '').trim();
    const bio = publicBio_(answers[ATTENDEE_SYNC.questions.bio]);
    if (!name || !bio) return;
    byEmail.set(email, {
      consent: true,
      name,
      bio,
      attendance: attendeeType_(answers[ATTENDEE_SYNC.questions.attendance]),
    });
  });

  return {
    attendees: [...byEmail.values()],
    registeredCount: registrationsByEmail.size,
  };
}

function syncAttendees() {
  const secret = PropertiesService.getScriptProperties().getProperty('ATTENDEES_SYNC_SECRET');
  if (!secret) throw new Error('Chybí Script Property ATTENDEES_SYNC_SECRET.');
  const payload = attendeePayload_();
  const response = UrlFetchApp.fetch(ATTENDEE_SYNC.webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-attendees-secret': secret },
    payload: JSON.stringify(payload),
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
