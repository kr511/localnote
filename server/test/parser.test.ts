import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/parser.js';

describe('parseCards', () => {
  it('erkennt Frage >> Antwort', () => {
    expect(parseCards('Was ist die Hauptstadt von Frankreich? >> Paris')).toEqual([
      { slot: 'basic', kind: 'basic', front: 'Was ist die Hauptstadt von Frankreich?', back: 'Paris' },
    ]);
  });

  it('erkennt Begriff << Definition in beide Richtungen', () => {
    const cards = parseCards('Mitose << Zellkernteilung');
    expect(cards.map((c) => [c.slot, c.front, c.back])).toEqual([
      ['fwd', 'Mitose', 'Zellkernteilung'],
      ['rev', 'Zellkernteilung', 'Mitose'],
    ]);
  });

  it('erkennt Lückentext, eine Karte pro Lücke', () => {
    const cards = parseCards('Das Herz pumpt {{Blut}} durch den {{Körper}}.');
    expect(cards).toEqual([
      { slot: 'c0', kind: 'cloze', front: 'Das Herz pumpt […] durch den Körper.', back: 'Blut' },
      { slot: 'c1', kind: 'cloze', front: 'Das Herz pumpt Blut durch den […].', back: 'Körper' },
    ]);
  });

  it('ignoriert normalen Text und leere Seiten', () => {
    expect(parseCards('Nur eine Notiz')).toEqual([]);
    expect(parseCards('Frage >>')).toEqual([]);
    expect(parseCards('<< Antwort')).toEqual([]);
    expect(parseCards('leer {{ }}')).toEqual([]);
    expect(parseCards('   ')).toEqual([]);
  });

  it('>> hat Vorrang vor << und Cloze', () => {
    expect(parseCards('a << b >> c')[0]).toMatchObject({ kind: 'basic', front: 'a << b', back: 'c' });
    expect(parseCards('{{x}} >> y')[0]).toMatchObject({ kind: 'basic' });
  });
});
