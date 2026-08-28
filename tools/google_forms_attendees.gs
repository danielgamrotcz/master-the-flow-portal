// Synchronizace veřejného seznamu účastníků z Google Formuláře do Cloudflare KV.
// Skript nikdy neodpovídá účastníkům. E-mail zadaný respondentem používá pouze
// uvnitř formuláře k deduplikaci; při nejasné odhlášce upozorní vlastníka.

const ATTENDEE_SYNC = Object.freeze({
  // Původní formulář znovu přijímá registrace na hlavní program i piknik.
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
  consentNo: 'Nechci být na stránce uveden/a',
});

const ORIGINAL_FORM = Object.freeze({
  title: 'Registrace – Sraz Master the Flow v Praze 29. 8. 2026',
  description: [
    'První sraz Master the Flow proběhne v sobotu 29. 8. 2026 v Lampárně Lidická, Praha 5. Hlavní program je od 13:00 do 18:00 a potom pokračujeme společným piknikem.',
    'Po několika odhláškách je registrace znovu otevřená do naplnění kapacity 30 lidí. Přijít můžete, i když nejste v Master the Flow. Ve formuláři zvolíte hlavní program, piknik, obojí, nebo zatím nejistou účast.',
    'Jméno a e-mail používám k organizaci srazu a zaslání praktických informací. Jméno a případný popis zveřejním na stránce srazu jen při vašem výslovném souhlasu; e-mail se na web neposílá. Formulář provozuje Google.',
  ].join('\n\n'),
  confirmation: 'Díky, s vámi na srazu počítám. Praktické informace pošlu na zadaný e-mail. Pokud se váš plán změní, upravte svoji odpověď přes odkaz, který vám Google po odeslání nabídne.',
  attendanceChoices: Object.freeze([
    'Dorazím na oficiální část 13:00–18:00',
    'Dorazím na oficiální část i na společný piknik po 18:00',
    'Přijdu jen na piknik po 18:00',
    'Zatím nevím přesně',
  ]),
});

const PICNIC_FORM = Object.freeze({
  title: 'Piknik po srazu Master the Flow v Praze — 29. 8. 2026',
  description: [
    'Po několika odhláškách je znovu otevřená i registrace na hlavní program. Tento samostatný formulář dál slouží pouze lidem, kteří chtějí přijít na společný piknik po 18:00. Na hlavní program nebo na obě části se registrujte v hlavním formuláři: https://docs.google.com/forms/d/e/1FAIpQLSc-IoU8ka75ur-VzBTfb88PZZMBjvVc7kVU2_BKeHdIM7YN7g/viewform',
    '',
    'Jméno, e-mail a případný popis používám k organizaci pikniku 29. 8. 2026. Jméno a popis zveřejním na stránce srazu jen při vašem výslovném souhlasu; e-mail se na web neposílá. Formulář provozuje Google.',
  ].join('\n'),
  confirmation: 'Díky, s vámi na piknik počítám. Přesné místo a organizační informace pošlu na zadaný e-mail před akcí. Pokud se váš plán změní, upravte svoji odpověď přes odkaz, který vám Google po odeslání nabídne.',
});

const CANCELLATION_AUTOMATION = Object.freeze({
  subject: 'V sobotu se vidíme na Master the Flow srazu: místo, čas a co si vzít',
  eventStartsAt: new Date('2026-08-29T11:00:00Z'),
  processedMessageIdsProperty: 'MEETUP_CANCELLATION_PROCESSED_MESSAGE_IDS',
  resolvedEmailPropertyPrefix: 'MEETUP_CANCELLATION_RESOLVED_EMAIL_',
  maxProcessedMessageIds: 500,
});

function findFormItemByTitle_(form, title) {
  const normalizedTitle = String(title).replace(/[\s\u2010-\u2015-]/g, '').toLowerCase();
  return form.getItems().find(candidate => (
    String(candidate.getTitle()).replace(/[\s\u2010-\u2015-]/g, '').toLowerCase() === normalizedTitle
  ));
}

function configureCleanPicnicForm_(form) {
  form
    .setTitle(PICNIC_FORM.title)
    .setDescription(PICNIC_FORM.description)
    .setConfirmationMessage(PICNIC_FORM.confirmation)
    .setAcceptingResponses(true)
    .setAllowResponseEdits(true)
    .setCollectEmail(false)
    .setLimitOneResponsePerUser(false)
    .setPublishingSummary(false)
    .setShowLinkToRespondAgain(true);

  const existingEmailItem = findFormItemByTitle_(form, 'E-mail');
  const emailTextItem = existingEmailItem
    ? existingEmailItem.asTextItem()
    : form.addTextItem().setTitle('E-mail');
  emailTextItem
    .setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build())
    .setHelpText('Použiju ho jen k organizaci pikniku. Na web se neposílá.');
  form.moveItem(emailTextItem.getIndex(), 0);
  const existingNameItem = findFormItemByTitle_(form, ATTENDEE_SYNC.questions.name);
  const nameItem = existingNameItem
    ? existingNameItem.asTextItem()
    : form.addTextItem().setTitle(ATTENDEE_SYNC.questions.name);
  nameItem.setRequired(true);
  form.moveItem(nameItem.getIndex(), 1);

  const existingBioItem = findFormItemByTitle_(form, ATTENDEE_SYNC.questions.bio);
  const bioItem = existingBioItem
    ? existingBioItem.asParagraphTextItem()
    : form.addParagraphTextItem().setTitle(ATTENDEE_SYNC.questions.bio);
  bioItem
    .setRequired(false)
    .setHelpText('Nepovinné. Zobrazí se na stránce jen tehdy, když níže souhlasíte se zveřejněním.');
  form.moveItem(bioItem.getIndex(), 2);

  const existingConsentItem = findFormItemByTitle_(form, ATTENDEE_SYNC.questions.consent);
  const consentItem = existingConsentItem
    ? existingConsentItem.asMultipleChoiceItem()
    : form.addMultipleChoiceItem().setTitle(ATTENDEE_SYNC.questions.consent);
  consentItem
    .setChoiceValues([ATTENDEE_SYNC.consentYes, ATTENDEE_SYNC.consentNo])
    .setRequired(true)
    .setHelpText('Zveřejnění není podmínkou účasti. E-mail ani další odpovědi nezveřejním.');
  form.moveItem(consentItem.getIndex(), 3);

  // Tohle je samostatný piknikový formulář. Jakákoli další otázka znamená
  // chybu, ne archivní obsah, který by se mohl omylem znovu zpřístupnit.
  const allowedIds = new Set([emailTextItem.getId(), nameItem.getId(), bioItem.getId(), consentItem.getId()]);
  const unexpectedItems = form.getItems().filter(item => !allowedIds.has(item.getId()));
  if (unexpectedItems.length) {
    throw new Error(`Piknikový formulář obsahuje neočekávané položky: ${unexpectedItems.map(item => item.getTitle()).join(', ')}`);
  }
}

function picnicForm_() {
  const picnicFormId = PropertiesService.getScriptProperties().getProperty('PICNIC_FORM_ID');
  if (!picnicFormId) throw new Error('Chybí Script Property PICNIC_FORM_ID. Nejdřív spusťte createCleanPicnicRegistrationForm.');
  return FormApp.openById(picnicFormId);
}

// Bezpečně vytvoří nový samostatný formulář. Opakované spuštění nevytvoří
// duplikát, ale pouze znovu ověří a nastaví už uložený piknikový formulář.
function createCleanPicnicRegistrationForm() {
  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty('PICNIC_FORM_ID');
  const form = existingId ? FormApp.openById(existingId) : FormApp.create(PICNIC_FORM.title);
  if (!existingId) properties.setProperty('PICNIC_FORM_ID', form.getId());
  configureCleanPicnicForm_(form);
  console.log(`PICNIC_FORM_ID=${form.getId()}`);
  console.log(`PICNIC_FORM_EDIT_URL=${form.getEditUrl()}`);
  console.log(`PICNIC_FORM_PUBLIC_URL=${form.getPublishedUrl()}`);
}

function configurePicnicRegistrationForm() {
  configureCleanPicnicForm_(picnicForm_());
}

function archiveOriginalRegistrationForm() {
  FormApp.openById(ATTENDEE_SYNC.formId)
    .setTitle('Archiv registrací — Sraz Master the Flow v Praze 29. 8. 2026')
    .setAcceptingResponses(false);
  // Zpráva uzavřeného formuláře s odkazem na nový piknikový formulář je
  // nastavená v publikačním dialogu Google Forms; současné Forms API ji pro
  // publikovaný formulář odmítá aktualizovat.
}

function restoreOriginalRegistrationForm() {
  const form = FormApp.openById(ATTENDEE_SYNC.formId);
  form
    .setTitle(ORIGINAL_FORM.title)
    .setDescription(ORIGINAL_FORM.description)
    .setConfirmationMessage(ORIGINAL_FORM.confirmation)
    .setAcceptingResponses(true)
    .setAllowResponseEdits(true)
    .setCollectEmail(false)
    .setLimitOneResponsePerUser(false)
    .setPublishingSummary(false)
    .setShowLinkToRespondAgain(true);

  const emailItem = findFormItemByTitle_(form, 'E-mail').asTextItem();
  emailItem
    .setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build())
    .setHelpText('Použiju ho jen k organizaci srazu a zaslání praktických informací. Na web se neposílá.');
  findFormItemByTitle_(form, ATTENDEE_SYNC.questions.name).asTextItem().setRequired(true);
  findFormItemByTitle_(form, ATTENDEE_SYNC.questions.attendance)
    .asMultipleChoiceItem()
    .setChoiceValues([...ORIGINAL_FORM.attendanceChoices])
    .setRequired(true);
  findFormItemByTitle_(form, ATTENDEE_SYNC.questions.bio)
    .asParagraphTextItem()
    .setRequired(false)
    .setHelpText('Nepovinné. Zobrazí se na stránce jen tehdy, když níže souhlasíte se zveřejněním.');
  findFormItemByTitle_(form, ATTENDEE_SYNC.questions.consent)
    .asMultipleChoiceItem()
    .setChoiceValues([ATTENDEE_SYNC.consentYes, ATTENDEE_SYNC.consentNo])
    .setRequired(true)
    .setHelpText('Zveřejnění není podmínkou účasti. E-mail ani další odpovědi nezveřejním.');

  const detailsPage = form.getItems(FormApp.ItemType.PAGE_BREAK)[0];
  if (!detailsPage) throw new Error('Původní formulář nemá očekávanou druhou sekci.');
  detailsPage.asPageBreakItem()
    .setTitle('Účast a pár slov o vás')
    .setHelpText('')
    .setGoToPage(FormApp.PageNavigationType.CONTINUE);

  // Starý samostatný odkaz na piknik zůstává funkční, ale nesmí tvrdit, že je
  // hlavní program plný.
  configureCleanPicnicForm_(picnicForm_());
}

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
    'Jsem registrovaný/á na hlavní program a přidám se na piknik po 18:00': 'official_and_picnic',
    'Přijdu jen na piknik po 18:00': 'picnic_only',
    'Přijdu na piknik po 18:00': 'picnic_only',
    'Zatím nevím přesně': 'uncertain',
  };
  // Nový čistě piknikový formulář otázku na rozsah účasti nezobrazuje.
  return mapping[String(answer || '').trim()] || 'picnic_only';
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

function normalizedEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizedName_(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035'\"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizedHeader_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function parseMailbox_(from) {
  const source = String(from || '').trim();
  const bracketed = source.match(/^(.*)<([^<>]+)>\s*$/);
  if (bracketed) {
    return {
      name: bracketed[1].replace(/^[\s\"]+|[\s\"]+$/g, ''),
      email: normalizedEmail_(bracketed[2]),
    };
  }
  const emailMatch = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? normalizedEmail_(emailMatch[0]) : '';
  const name = emailMatch ? source.replace(emailMatch[0], '').trim() : source;
  return { name: name.replace(/^[\s\"]+|[\s\"]+$/g, ''), email };
}

function stripQuotedReply_(body) {
  const source = String(body || '').replace(/\r\n/g, '\n');
  const separators = [
    /^\s*>/m,
    /^\s*On .+wrote:\s*$/mi,
    /^\s*Dne .+napsal(?:\(a\))?:\s*$/mi,
    /^\s*-{2,}\s*Původní e[‑-]mail\s*-{2,}\s*$/mi,
    /^\s*Od:\s*Daniel Gamrot\b/mi,
  ];
  const firstSeparator = separators
    .map(pattern => source.search(pattern))
    .filter(index => index >= 0)
    .reduce((earliest, index) => Math.min(earliest, index), source.length);
  return source.slice(0, firstSeparator).trim();
}

function classifyMeetupCancellation_(body) {
  const reply = stripQuotedReply_(body);
  const text = reply.normalize('NFKC').toLowerCase();
  const cancellationTerm = /\b(?:nedoraz[íi]m|neodraz[íi]m|nepřijdu|neprijdu)\b/i.test(reply);
  const positive = /\b(?:doraz[íi]m|přijdu|prijdu)\b/i.test(reply);
  if (cancellationTerm && positive) {
    return { action: 'review', reason: 'conflicting_attendance_statement', reply };
  }

  const keyword = /(?:^|\n)\s*(?:nedoraz[íi]m|neodraz[íi]m)\s*(?:[.!]|$)/im.test(reply);
  const explicitSentence = /\b(?:bohužel|bohuzel|omlouvám se|omlouvam se|musím|musim)[^.!?\n]{0,120}\b(?:nedoraz[íi]m|neodraz[íi]m|nepřijdu|neprijdu)\b/i.test(reply);
  const explicitAction = /\b(?:odhlašuji se|odhlasuji se|musím se odhlásit|musim se odhlasit|ruším svou účast|rusim svou ucast|zrušte mou účast|zruste mou ucast)\b/i.test(reply);
  const cancellation = keyword || explicitSentence || explicitAction;
  if (!cancellation) return { action: 'ignore', reason: 'no_explicit_cancellation', reply };

  const partialScope = ['piknik', 'hlavní program', 'hlavni program', 'oficiální část', 'oficialni cast']
    .some(term => text.includes(term));
  const fullScope = ['celý sraz', 'cely sraz', 'vůbec', 'vubec', 'obojí', 'oboji', 'sraz i piknik', 'hlavní program i piknik', 'hlavni program i piknik']
    .some(term => text.includes(term));
  if (partialScope && !fullScope) return { action: 'review', reason: 'partial_scope', reply };

  return { action: 'cancel', reason: keyword ? 'explicit_keyword' : 'explicit_sentence', reply };
}

function registrationRecords_() {
  return [FormApp.openById(ATTENDEE_SYNC.formId), picnicForm_()].flatMap(form => (
    form.getResponses().map(response => {
      const answers = attendeeAnswers_(response);
      return {
        form,
        response,
        email: attendeeEmail_(response, answers),
        name: String(answers[ATTENDEE_SYNC.questions.name] || '').trim(),
      };
    })
  ));
}

function resolveRegistrationIdentity_(mailbox, records) {
  const senderEmail = normalizedEmail_(mailbox.email);
  const emailMatches = senderEmail
    ? records.filter(record => normalizedEmail_(record.email) === senderEmail)
    : [];
  if (emailMatches.length) {
    return { status: 'matched', email: senderEmail, records: emailMatches, method: 'email' };
  }

  const senderName = normalizedName_(mailbox.name);
  if (!senderName) return { status: 'not_found', reason: 'missing_sender_identity', records: [] };
  const nameMatches = records.filter(record => normalizedName_(record.name) === senderName);
  const matchingEmails = [...new Set(nameMatches.map(record => normalizedEmail_(record.email)).filter(Boolean))];
  if (matchingEmails.length === 1) {
    return { status: 'matched', email: matchingEmails[0], records: nameMatches, method: 'unique_name' };
  }
  if (matchingEmails.length > 1) {
    return { status: 'review', reason: 'ambiguous_name', records: nameMatches };
  }
  return { status: 'not_found', reason: 'registration_not_found', records: [] };
}

function responseSheetRows_(form, email) {
  const destinationId = form.getDestinationId();
  if (!destinationId) return [];
  const normalizedTarget = normalizedEmail_(email);
  const rows = [];
  SpreadsheetApp.openById(destinationId).getSheets().forEach(sheet => {
    const values = sheet.getDataRange().getDisplayValues();
    if (values.length < 2) return;
    const headers = values[0].map(normalizedHeader_);
    if (!['casovaznacka', 'casoverazitko', 'timestamp'].includes(headers[0])) return;
    const emailColumns = headers
      .map((header, index) => ['email', 'emailovaadresa'].includes(header) ? index : -1)
      .filter(index => index >= 0);
    if (!emailColumns.length) return;
    for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
      if (emailColumns.some(column => normalizedEmail_(values[rowIndex][column]) === normalizedTarget)) {
        rows.push({ sheet, row: rowIndex + 1 });
      }
    }
  });
  return rows;
}

function removeRegistrationByEmail_(email) {
  const forms = [FormApp.openById(ATTENDEE_SYNC.formId), picnicForm_()];
  const records = forms.flatMap(form => form.getResponses().map(response => {
    const answers = attendeeAnswers_(response);
    return { form, response, email: attendeeEmail_(response, answers) };
  })).filter(record => normalizedEmail_(record.email) === normalizedEmail_(email));
  const uniqueRows = new Map();
  forms.forEach(form => {
    responseSheetRows_(form, email).forEach(candidate => {
      const key = `${candidate.sheet.getParent().getId()}:${candidate.sheet.getSheetId()}:${candidate.row}`;
      uniqueRows.set(key, candidate);
    });
  });
  const rows = [...uniqueRows.values()];
  const rowsBySheet = new Map();
  rows.forEach(candidate => {
    const key = `${candidate.sheet.getParent().getId()}:${candidate.sheet.getSheetId()}`;
    if (!rowsBySheet.has(key)) rowsBySheet.set(key, []);
    rowsBySheet.get(key).push(candidate);
  });
  rowsBySheet.forEach(sheetRows => {
    sheetRows
      .sort((left, right) => right.row - left.row)
      .forEach(candidate => candidate.sheet.deleteRow(candidate.row));
  });
  records.forEach(record => record.form.deleteResponse(record.response.getId()));
  syncAttendees();
  return { deletedResponses: records.length, deletedRows: rows.length };
}

function cancellationMessageIds_() {
  const threads = GmailApp.search(`subject:"${CANCELLATION_AUTOMATION.subject}" after:2026/08/26 -in:spam -in:trash`, 0, 50);
  return threads.flatMap(thread => thread.getMessages());
}

function processedCancellationMessageIds_() {
  const value = PropertiesService.getScriptProperties()
    .getProperty(CANCELLATION_AUTOMATION.processedMessageIdsProperty);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    throw new Error('Stav automatu odhlášek je poškozený; nic nebylo změněno.');
  }
}

function saveProcessedCancellationMessageIds_(ids) {
  const uniqueIds = [...new Set(ids.map(String))].slice(-CANCELLATION_AUTOMATION.maxProcessedMessageIds);
  PropertiesService.getScriptProperties()
    .setProperty(CANCELLATION_AUTOMATION.processedMessageIdsProperty, JSON.stringify(uniqueIds));
}

function notifyCancellationReview_(message, mailbox, reason) {
  const ownerEmail = Session.getEffectiveUser().getEmail();
  if (!ownerEmail) throw new Error('Nelze určit e-mail vlastníka pro upozornění na nejasnou odhlášku.');
  MailApp.sendEmail({
    to: ownerEmail,
    subject: 'Nejasná odhláška ze srazu — potřeba ruční kontrola',
    body: [
      'Automat odhlášku neprovedl, protože shoda nebo rozsah účasti nejsou jednoznačné.',
      '',
      `Důvod: ${reason}`,
      `Odesílatel: ${mailbox.name || '(bez jména)'} <${mailbox.email || 'bez e-mailu'}>`,
      `Předmět: ${message.getSubject()}`,
      '',
      'Původní zpráva zůstala beze změny v Gmailu. Zkontrolujte ji prosím ručně.',
    ].join('\n'),
  });
}

function processMeetupCancellations() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const now = new Date();
    const cutoff = CANCELLATION_AUTOMATION.eventStartsAt;
    const processed = new Set(processedCancellationMessageIds_());
    const ownerEmail = normalizedEmail_(Session.getEffectiveUser().getEmail());
    const messages = cancellationMessageIds_()
      .filter(message => !processed.has(String(message.getId())))
      .filter(message => message.getDate() <= cutoff)
      .sort((left, right) => left.getDate() - right.getDate());
    const markProcessed = message => {
      processed.add(String(message.getId()));
      saveProcessedCancellationMessageIds_([...processed]);
    };

    messages.forEach(message => {
      const mailbox = parseMailbox_(message.getFrom());
      if (ownerEmail && mailbox.email === ownerEmail) {
        markProcessed(message);
        return;
      }
      const classification = classifyMeetupCancellation_(message.getPlainBody());
      if (classification.action === 'ignore') {
        markProcessed(message);
        return;
      }
      if (classification.action === 'review') {
        notifyCancellationReview_(message, mailbox, classification.reason);
        markProcessed(message);
        return;
      }

      const properties = PropertiesService.getScriptProperties();
      const resolvedProperty = `${CANCELLATION_AUTOMATION.resolvedEmailPropertyPrefix}${message.getId()}`;
      const previouslyResolvedEmail = properties.getProperty(resolvedProperty);
      if (previouslyResolvedEmail) {
        removeRegistrationByEmail_(previouslyResolvedEmail);
        properties.deleteProperty(resolvedProperty);
        markProcessed(message);
        return;
      }
      const records = registrationRecords_();
      const identity = resolveRegistrationIdentity_(mailbox, records);
      if (identity.status !== 'matched') {
        notifyCancellationReview_(message, mailbox, identity.reason || identity.status);
        markProcessed(message);
        return;
      }

      properties.setProperty(resolvedProperty, identity.email);
      removeRegistrationByEmail_(identity.email);
      properties.deleteProperty(resolvedProperty);
      markProcessed(message);
    });

    if (now >= cutoff) removeMeetupCancellationTriggers_();
  } finally {
    lock.releaseLock();
  }
}

function installMeetupCancellationAutomation() {
  const now = new Date();
  if (now >= CANCELLATION_AUTOMATION.eventStartsAt) {
    throw new Error('Sraz už začal; automat odhlášek nebyl nainstalován.');
  }
  removeMeetupCancellationTriggers_();
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty(CANCELLATION_AUTOMATION.processedMessageIdsProperty)) {
    saveProcessedCancellationMessageIds_(cancellationMessageIds_().map(message => String(message.getId())));
  }
  ScriptApp.newTrigger('processMeetupCancellations').timeBased().everyHours(2).create();
  ScriptApp.newTrigger('processMeetupCancellations').timeBased().at(CANCELLATION_AUTOMATION.eventStartsAt).create();
}

function removeMeetupCancellationTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'processMeetupCancellations')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}

function attendeePayload_() {
  if (new Date() > ATTENDEE_SYNC.publishUntil) {
    return { attendees: [], registeredCount: 0, officialRegisteredCount: 0, picnicRegisteredCount: 0 };
  }
  const legacyResponses = FormApp.openById(ATTENDEE_SYNC.formId).getResponses();
  const picnicFormId = PropertiesService.getScriptProperties().getProperty('PICNIC_FORM_ID');
  const picnicResponses = picnicFormId ? FormApp.openById(picnicFormId).getResponses() : [];
  // Původní odpovědi se zpracují první. Nová pikniková odpověď stejného e-mailu
  // tak může doplnit piknik, ale nikdy nesmaže historické místo v programu.
  const responses = [...legacyResponses, ...picnicResponses];
  const byEmail = new Map();
  const latestAttendanceByEmail = new Map();
  const officialRegistrationsByEmail = new Map();

  responses.forEach(response => {
    const answers = attendeeAnswers_(response);
    const email = attendeeEmail_(response, answers);
    if (!email) return;
    const attendance = attendeeType_(answers[ATTENDEE_SYNC.questions.attendance]);
    latestAttendanceByEmail.set(email, attendance);
    if (attendance === 'official' || attendance === 'official_and_picnic' || attendance === 'uncertain') {
      officialRegistrationsByEmail.set(email, true);
    }
    const consentAnswer = answers[ATTENDEE_SYNC.questions.consent];
    if (consentAnswer && consentAnswer !== ATTENDEE_SYNC.consentYes) {
      byEmail.delete(email);
      return;
    }
    if (!consentAnswer) {
      const existingProfile = byEmail.get(email);
      if (existingProfile && attendance === 'picnic_only') {
        existingProfile.attendance = existingProfile.attendance === 'picnic_only'
          ? 'picnic_only'
          : 'official_and_picnic';
      }
      return;
    }
    const name = String(answers[ATTENDEE_SYNC.questions.name] || '').trim();
    const bio = publicBio_(answers[ATTENDEE_SYNC.questions.bio]);
    if (!name || !bio) return;
    const publicAttendance = attendance === 'picnic_only' && officialRegistrationsByEmail.has(email)
      ? 'official_and_picnic'
      : attendance;
    byEmail.set(email, {
      consent: true,
      name,
      bio,
      attendance: publicAttendance,
    });
  });

  const latestAttendances = [...latestAttendanceByEmail.values()];
  const officialRegisteredCount = officialRegistrationsByEmail.size;
  const picnicRegisteredCount = latestAttendances.filter(attendance => (
    attendance === 'official_and_picnic' || attendance === 'picnic_only'
  )).length;

  return {
    attendees: [...byEmail.values()],
    // registeredCount zůstává dočasně kvůli kompatibilitě se starší verzí API.
    registeredCount: officialRegisteredCount,
    officialRegisteredCount,
    picnicRegisteredCount,
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
  [FormApp.openById(ATTENDEE_SYNC.formId), picnicForm_()].forEach(form => {
    ScriptApp.newTrigger('syncAttendees').forForm(form).onFormSubmit().create();
  });
  ScriptApp.newTrigger('syncAttendees').timeBased().everyHours(6).create();
  syncAttendees();
}

function removeAttendeeSyncTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'syncAttendees')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}
