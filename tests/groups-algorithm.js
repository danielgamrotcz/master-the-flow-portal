const fs = require('fs');
const path = require('path');

let failures = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : '  <-- ' + detail}`);
  if (!condition) failures++;
}

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'api', '_groups.js'), 'utf8');
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const { planGroupSizes, buildBalancedGroups } = await import(moduleUrl);

  for (let count = 3; count <= 32; count++) {
    const sizes = planGroupSizes(count);
    const possible = count !== 5;
    check(`Počet ${count} má ${possible ? 'platné' : 'odmítnuté'} složení`, possible
      ? Array.isArray(sizes) && sizes.reduce((sum, size) => sum + size, 0) === count && sizes.every(size => size === 3 || size === 4)
      : sizes === null, JSON.stringify(sizes));
  }

  check('Při 27–30 lidech vzniká nejvýše osm týmů', [27, 28, 29, 30].every(count => planGroupSizes(count).length === 8));
  check('Méně než tři a více než třicet dva lidí je odmítnuto', planGroupSizes(2) === null && planGroupSizes(33) === null);

  const participants = Array.from({ length: 24 }, (_, index) => ({
    id: `person-${index + 1}`,
    nickname: `Člověk ${String(index + 1).padStart(2, '0')}`,
    experience: 10 - (index % 10),
    hasLaptop: index < 8 || index % 3 === 0,
  }));
  const first = buildBalancedGroups(participants);
  const second = buildBalancedGroups([...participants].reverse());
  const topIds = new Set([...participants].sort((a, b) => b.experience - a.experience || Number(b.hasLaptop) - Number(a.hasLaptop) || a.nickname.localeCompare(b.nickname, 'cs', { sensitivity: 'base' })).slice(0, first.length).map(person => person.id));

  check('Stejná data dávají deterministické rozdělení bez ohledu na pořadí vstupu', JSON.stringify(first) === JSON.stringify(second));
  check('Každý člověk je právě v jednom týmu', new Set(first.flatMap(group => group.members.map(member => member.id))).size === participants.length);
  check('Každý tým má jednu z nejsilnějších kotev', first.every(group => group.members.some(member => topIds.has(member.id))));
  check('Dostupné notebooky pokryjí všechny týmy', first.every(group => group.hasLaptop));
  check('Rozdíl průměrné zkušenosti je v reprezentativním vzorku nejvýše 1,5 bodu', Math.max(...first.map(group => group.averageExperience)) - Math.min(...first.map(group => group.averageExperience)) <= 1.5, JSON.stringify(first.map(group => group.averageExperience)));

  const localMinimum = buildBalancedGroups([10, 10, 7, 7, 7, 1].map((experience, index) => ({
    id: `local-${index}`,
    nickname: `Lokální ${index}`,
    experience,
    hasLaptop: index === 0 || index === 2,
  })));
  const localMinimumSpread = Math.max(...localMinimum.map(group => group.averageExperience))
    - Math.min(...localMinimum.map(group => group.averageExperience));
  check('Dvousměnná optimalizace odstraní známé lokální minimum 8/6', localMinimumSpread === 0, JSON.stringify(localMinimum));
  check('Dolaďování zachová notebook v každém týmu', localMinimum.every(group => group.hasLaptop));
  check('Dolaďování zachová zkušeného člověka v každém týmu', localMinimum.every(group => group.members.some(member => member.experience >= 7)));

  const scarceResources = buildBalancedGroups([10, 8, 6, 6, 6, 5, 4, 3, 2].map((experience, index) => ({
    id: `scarce-${index}`,
    nickname: `Vzácný ${index}`,
    experience,
    hasLaptop: index < 2,
  })));
  check('Dva dostupné notebooky zůstanou ve dvou různých týmech', scarceResources.filter(group => group.hasLaptop).length === 2, JSON.stringify(scarceResources));
  check('Dva dostupní zkušení lidé zůstanou ve dvou různých týmech', scarceResources.filter(group => group.members.some(member => member.experience >= 7)).length === 2, JSON.stringify(scarceResources));

  const noLaptop = buildBalancedGroups(participants.map(person => ({ ...person, hasLaptop: false })));
  check('Nedostatek notebooků neblokuje jinak platné rozdělení', noLaptop.length === 8 && noLaptop.every(group => !group.hasLaptop));

  if (failures) {
    console.error(`\n${failures} KONTROL ALGORITMU SELHALO`);
    process.exit(1);
  }
  console.log('\nALGORITMUS SKUPINEK: VŠE PROŠLO');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
