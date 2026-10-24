export type MatchSort = 'number' | 'name' | 'minutes' | 'goals' | 'starts' | 'appearances';

type MatchStat = { number?: number | null; minutes: number; goals?: number; starts?: number; appearances?: number; name: string };

export function sortMatchStats<T extends MatchStat>(items: T[], sort: MatchSort): T[] {
  const number = (item: MatchStat) => item.number ?? Number.POSITIVE_INFINITY;
  return [...items].sort((a, b) => {
    if (sort === 'number') return number(a) - number(b) || a.name.localeCompare(b.name, 'es');
    if (sort === 'name') return a.name.localeCompare(b.name, 'es');
    if (sort === 'starts') return (b.starts ?? 0) - (a.starts ?? 0) || b.minutes - a.minutes || number(a) - number(b) || a.name.localeCompare(b.name, 'es');
    if (sort === 'appearances') return (b.appearances ?? 0) - (a.appearances ?? 0) || b.minutes - a.minutes || number(a) - number(b) || a.name.localeCompare(b.name, 'es');
    if (sort === 'goals') return (b.goals ?? 0) - (a.goals ?? 0) || b.minutes - a.minutes || number(a) - number(b) || a.name.localeCompare(b.name, 'es');
    return b.minutes - a.minutes || (b.goals ?? 0) - (a.goals ?? 0) || number(a) - number(b) || a.name.localeCompare(b.name, 'es');
  });
}
