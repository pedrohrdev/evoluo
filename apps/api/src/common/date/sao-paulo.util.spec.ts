import { currentMonthRangeInSaoPaulo, currentWeekRangeInSaoPaulo, todayInSaoPaulo } from './sao-paulo.util';

// Horário fixado ao meio-dia em São Paulo (15h UTC, UTC-3) para que a data
// civil resultante nunca dependa da hora exata em que o teste roda.
function atNoonInSaoPaulo(dateString: string): Date {
  return new Date(`${dateString}T15:00:00Z`);
}

describe('currentWeekRangeInSaoPaulo', () => {
  it('returns Monday-Sunday for a mid-week reference date', () => {
    // 2026-01-07 é uma quarta-feira.
    expect(currentWeekRangeInSaoPaulo(atNoonInSaoPaulo('2026-01-07'))).toEqual({
      periodStart: '2026-01-05',
      periodEnd: '2026-01-11',
    });
  });

  it('returns itself as periodStart when today is already Monday', () => {
    expect(currentWeekRangeInSaoPaulo(atNoonInSaoPaulo('2026-01-05'))).toEqual({
      periodStart: '2026-01-05',
      periodEnd: '2026-01-11',
    });
  });

  it('returns itself as periodEnd when today is Sunday', () => {
    expect(currentWeekRangeInSaoPaulo(atNoonInSaoPaulo('2026-01-11'))).toEqual({
      periodStart: '2026-01-05',
      periodEnd: '2026-01-11',
    });
  });

  it('crosses the month boundary correctly', () => {
    // 2026-02-01 é um domingo, então a semana começa em janeiro.
    expect(currentWeekRangeInSaoPaulo(atNoonInSaoPaulo('2026-02-01'))).toEqual({
      periodStart: '2026-01-26',
      periodEnd: '2026-02-01',
    });
  });
});

describe('currentMonthRangeInSaoPaulo', () => {
  it('returns the 1st to the last day for a 31-day month', () => {
    expect(currentMonthRangeInSaoPaulo(atNoonInSaoPaulo('2026-01-15'))).toEqual({
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    });
  });

  it('returns the 1st to the 28th for February in a non-leap year', () => {
    expect(currentMonthRangeInSaoPaulo(atNoonInSaoPaulo('2026-02-10'))).toEqual({
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
    });
  });

  it('returns the 1st to the 29th for February in a leap year', () => {
    expect(currentMonthRangeInSaoPaulo(atNoonInSaoPaulo('2028-02-10'))).toEqual({
      periodStart: '2028-02-01',
      periodEnd: '2028-02-29',
    });
  });

  it('handles December without rolling into the wrong year', () => {
    expect(currentMonthRangeInSaoPaulo(atNoonInSaoPaulo('2026-12-15'))).toEqual({
      periodStart: '2026-12-01',
      periodEnd: '2026-12-31',
    });
  });
});

describe('todayInSaoPaulo (regression guard for the fixed reference time used above)', () => {
  it('keeps the calendar date at noon UTC-3, unaffected by the timezone conversion', () => {
    expect(todayInSaoPaulo(atNoonInSaoPaulo('2026-01-07'))).toBe('2026-01-07');
  });
});
