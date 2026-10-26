import { currentLocale } from '../i18n';
import type { LifeEvent, TimelineDate } from './types';

type NewEvent = Pick<LifeEvent, 'title' | 'description' | 'category' | 'startDate' | 'endDate' | 'isOngoing'>;

const examples = {
  de: [
    ['Urlaub in Lissabon', 'Reisen'], ['Umzug ins neue Zuhause', 'Zuhause'],
    ['Erster Halbmarathon', 'Sport'], ['Ein neues Kapitel im Beruf', 'Arbeit'],
    ['Gitarrenunterricht', 'Hobbys'], ['Wanderung in den Alpen', 'Natur'],
    ['Ein Fest mit Freunden', 'Freundschaft'], ['Ein Wochenende am Meer', 'Reisen'],
    ['Ein neues Familienmitglied', 'Familie'], ['Ein eigenes Gartenprojekt', 'Zuhause'],
    ['Sprachkurs Italienisch', 'Lernen'], ['Mit dem Rad durch die Stadt', 'Sport'],
  ],
  en: [
    ['Holiday in Lisbon', 'Travel'], ['Moving to a new home', 'Home'],
    ['First half marathon', 'Sports'], ['A new chapter at work', 'Work'],
    ['Guitar lessons', 'Hobbies'], ['Hiking in the Alps', 'Nature'],
    ['A celebration with friends', 'Friendship'], ['A weekend by the sea', 'Travel'],
    ['A new family member', 'Family'], ['Starting a garden', 'Home'],
    ['Italian language course', 'Learning'], ['Cycling through the city', 'Sports'],
  ],
};

export function createRandomEvents(): NewEvent[] {
  const locale = currentLocale();
  const pool = [...examples[locale]];
  const batch = crypto.randomUUID();
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const day = 86_400_000;
  const dateValue = (time: number): TimelineDate => {
    const date = new Date(time);
    const precision = (['day', 'month', 'year'] as const)[Math.floor(Math.random() * 3)];
    return {
      precision,
      year: date.getUTCFullYear(),
      ...(precision !== 'year' ? { month: date.getUTCMonth() + 1 } : {}),
      ...(precision === 'day' ? { day: date.getUTCDate() } : {}),
    };
  };

  return Array.from({ length: 10 }, (_, index) => {
    const [title, category] = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const start = today - (1 + Math.floor(Math.random() * 30 * 365)) * day;
    const isRange = index % 3 !== 0;
    return {
      title: `[Demo ${batch.slice(0, 8)}] ${title}`,
      description: locale === 'de'
        ? 'Zufällig erzeugter Testeintrag für die lokale Entwicklung.'
        : 'Random test entry for local development.',
      category: `${locale === 'de' ? 'Testdaten' : 'Test data'}, ${category}`,
      startDate: dateValue(start),
      endDate: isRange ? dateValue(Math.min(today, start + (1 + Math.floor(Math.random() * 730)) * day)) : null,
      isOngoing: isRange && index % 3 === 2,
    };
  });
}
