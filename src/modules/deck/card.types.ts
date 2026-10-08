export const CARD_KEYS = [
  'gender',
  'age',
  'profession',
  'health',
  'phobia',
  'hobby',
  'baggage',
  'fact',
  'action',
] as const;

export type CardKey = (typeof CARD_KEYS)[number];

export type PlayerCard = Record<CardKey, string>;

export const isCardKey = (value: unknown): value is CardKey =>
  typeof value === 'string' && (CARD_KEYS as readonly string[]).includes(value);

export const CARD_LABELS: Record<CardKey, string> = {
  gender: 'Пол',
  age: 'Возраст',
  profession: 'Профессия',
  health: 'Здоровье',
  phobia: 'Фобия',
  hobby: 'Хобби',
  baggage: 'Багаж',
  fact: 'Факт',
  action: 'Действие',
};
