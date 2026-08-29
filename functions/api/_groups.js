const MAX_GROUPS = 8;
const MIN_GROUP_SIZE = 3;
const MAX_GROUP_SIZE = 4;
const EXPERIENCED_LEVEL = 7;

function participantOrder(first, second) {
  return second.experience - first.experience
    || Number(second.hasLaptop) - Number(first.hasLaptop)
    || first.nickname.localeCompare(second.nickname, 'cs', { sensitivity: 'base' })
    || String(first.id).localeCompare(String(second.id));
}

export function planGroupSizes(participantCount) {
  if (!Number.isSafeInteger(participantCount) || participantCount < MIN_GROUP_SIZE) return null;
  const groupCount = Math.min(MAX_GROUPS, Math.floor(participantCount / MIN_GROUP_SIZE));
  if (participantCount > groupCount * MAX_GROUP_SIZE) return null;

  const baseSize = Math.floor(participantCount / groupCount);
  const largerGroups = participantCount % groupCount;
  const sizes = Array.from({ length: groupCount }, (_, index) => baseSize + (index < largerGroups ? 1 : 0));
  return sizes.every(size => size >= MIN_GROUP_SIZE && size <= MAX_GROUP_SIZE) ? sizes : null;
}

function chooseGroup(groups, participant) {
  let candidates = groups.filter(group => group.members.length < group.targetSize);
  if (participant.hasLaptop && candidates.some(group => !group.hasLaptop)) {
    candidates = candidates.filter(group => !group.hasLaptop);
  }
  candidates.sort((first, second) => {
    const firstLoad = first.experienceTotal / first.targetSize;
    const secondLoad = second.experienceTotal / second.targetSize;
    return firstLoad - secondLoad
      || (first.members.length / first.targetSize) - (second.members.length / second.targetSize)
      || first.number - second.number;
  });
  return candidates[0];
}

function addMember(group, participant) {
  group.members.push(participant);
  group.experienceTotal += participant.experience;
  group.hasLaptop ||= participant.hasLaptop;
}

function subsetsOfSize(members, size) {
  if (size === 1) return members.map(member => [member]);
  const subsets = [];
  for (let first = 0; first < members.length - 1; first++) {
    for (let second = first + 1; second < members.length; second++) {
      subsets.push([members[first], members[second]]);
    }
  }
  return subsets;
}

function groupMetrics(groups) {
  const averages = groups.map(group => group.experienceTotal / group.targetSize);
  const overallAverage = groups.reduce((sum, group) => sum + group.experienceTotal, 0)
    / groups.reduce((sum, group) => sum + group.targetSize, 0);
  return [
    groups.filter(group => !group.hasLaptop).length,
    groups.filter(group => !group.members.some(member => member.experience >= EXPERIENCED_LEVEL)).length,
    Math.max(...averages) - Math.min(...averages),
    averages.reduce((sum, average) => sum + ((average - overallAverage) ** 2), 0),
  ];
}

function isBetterScore(candidate, current) {
  for (let index = 0; index < candidate.length; index++) {
    if (Math.abs(candidate[index] - current[index]) < Number.EPSILON) continue;
    return candidate[index] < current[index];
  }
  return false;
}

function rebuildGroup(group, members) {
  return {
    ...group,
    members,
    experienceTotal: members.reduce((sum, member) => sum + member.experience, 0),
    hasLaptop: members.some(member => member.hasLaptop),
  };
}

function improveBalance(groups) {
  let currentScore = groupMetrics(groups);

  // Týmy mají jen 3–4 lidi. Vyzkoušení deterministických výměn jednoho nebo
  // dvou členů proto zůstává malé, ale umí opravit i lokální minimum, které
  // jedním swapem zlepšit nejde. Nikdy při tom nezhorší pokrytí notebooky ani
  // zkušeným člověkem, pokud je jich v sále dost.
  for (let pass = 0; pass < 100; pass++) {
    let best = null;
    for (let firstIndex = 0; firstIndex < groups.length - 1; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < groups.length; secondIndex++) {
        for (const size of [1, 2]) {
          const firstSubsets = subsetsOfSize(groups[firstIndex].members, size);
          const secondSubsets = subsetsOfSize(groups[secondIndex].members, size);
          for (const firstMembers of firstSubsets) {
            for (const secondMembers of secondSubsets) {
              const nextGroups = [...groups];
              nextGroups[firstIndex] = rebuildGroup(groups[firstIndex], [
                ...groups[firstIndex].members.filter(member => !firstMembers.includes(member)),
                ...secondMembers,
              ]);
              nextGroups[secondIndex] = rebuildGroup(groups[secondIndex], [
                ...groups[secondIndex].members.filter(member => !secondMembers.includes(member)),
                ...firstMembers,
              ]);
              const score = groupMetrics(nextGroups);
              if (isBetterScore(score, currentScore) && (!best || isBetterScore(score, best.score))) {
                best = { groups: nextGroups, score };
              }
            }
          }
        }
      }
    }
    if (!best) break;
    groups = best.groups;
    currentScore = best.score;
  }
  return groups;
}

export function buildBalancedGroups(participants) {
  if (!Array.isArray(participants)) throw new TypeError('Participants must be an array');
  const sizes = planGroupSizes(participants.length);
  if (!sizes) throw new RangeError('Participant count cannot be split into groups of 3–4');

  const normalized = participants.map(participant => ({
    id: String(participant.id),
    nickname: String(participant.nickname),
    experience: Number(participant.experience),
    hasLaptop: Boolean(participant.hasLaptop),
  }));
  if (normalized.some(participant => (
    !participant.id || !participant.nickname || !Number.isSafeInteger(participant.experience)
    || participant.experience < 1 || participant.experience > 10
  ))) throw new TypeError('Invalid participant');

  const ordered = [...normalized].sort(participantOrder);
  const groups = sizes.map((targetSize, index) => ({
    number: index + 1,
    targetSize,
    members: [],
    experienceTotal: 0,
    hasLaptop: false,
  }));

  // Nejsilnější dostupní lidé tvoří kotvy týmů. Notebook rozhoduje až při
  // shodné zkušenosti, takže zařízení nepřebije podstatně vyšší dovednost.
  const anchors = ordered.splice(0, groups.length);
  anchors.forEach((participant, index) => addMember(groups[index], participant));

  // Zbylé notebooky rozdělíme nejdřív do týmů, které zatím zařízení nemají.
  // Potom se všichni ostatní přidávají k aktuálně nejslabšímu týmu vzhledem
  // k jeho cílové velikosti.
  const laptopParticipants = ordered.filter(participant => participant.hasLaptop);
  const otherParticipants = ordered.filter(participant => !participant.hasLaptop);
  for (const participant of [...laptopParticipants, ...otherParticipants]) {
    addMember(chooseGroup(groups, participant), participant);
  }

  return improveBalance(groups).map(group => ({
    number: group.number,
    members: [...group.members].sort(participantOrder),
    averageExperience: Number((group.experienceTotal / group.members.length).toFixed(2)),
    hasLaptop: group.hasLaptop,
  }));
}
