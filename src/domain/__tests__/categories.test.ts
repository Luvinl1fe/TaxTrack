import {
  ACTIVE_CATEGORIES,
  CATEGORIES,
  categoryById,
  substantiationCategoryIds,
} from '@/domain/categories';

describe('CATEGORIES', () => {
  it('has unique ids', () => {
    const ids = CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique names', () => {
    const names = CATEGORIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses slug-style ids that are safe as stable database keys', () => {
    for (const category of CATEGORIES) {
      expect(category.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('gives every category a myTax label', () => {
    for (const category of CATEGORIES) {
      expect(category.myTaxLabel).toMatch(/^D(10|[1-9])$/);
    }
  });
});

describe('phase 1 scope', () => {
  it('exposes 14 categories', () => {
    expect(ACTIVE_CATEGORIES).toHaveLength(14);
  });

  it('excludes D6, D7 and D8 from the active set', () => {
    const labels = ACTIVE_CATEGORIES.map((c) => c.myTaxLabel);
    expect(labels).not.toContain('D6');
    expect(labels).not.toContain('D7');
    expect(labels).not.toContain('D8');
  });

  it('still defines the Phase 3 categories so enabling them needs no migration', () => {
    const phase3 = CATEGORIES.filter((c) => c.phase === 3).map((c) => c.myTaxLabel);
    expect(phase3).toEqual(['D6', 'D7', 'D8']);
  });

  it('splits D5 eight ways', () => {
    const d5 = ACTIVE_CATEGORIES.filter((c) => c.myTaxLabel === 'D5');
    expect(d5).toHaveLength(8);
  });

  it('maps the non-D5 labels one to one', () => {
    for (const label of ['D1', 'D2', 'D3', 'D4', 'D9', 'D10'] as const) {
      expect(ACTIVE_CATEGORIES.filter((c) => c.myTaxLabel === label)).toHaveLength(1);
    }
  });
});

describe('entry kinds', () => {
  it('logs working-from-home hours rather than receipts', () => {
    expect(categoryById('wfh')?.entryKind).toBe('wfh');
  });

  it('logs vehicle trips rather than receipts', () => {
    expect(categoryById('car')?.entryKind).toBe('trips');
  });

  it('treats everything else as receipts', () => {
    const others = ACTIVE_CATEGORIES.filter((c) => !['wfh', 'car'].includes(c.id));
    for (const category of others) {
      expect(category.entryKind).toBe('receipt');
    }
  });
});

describe('substantiation threshold scope', () => {
  it('excludes car expenses, which have their own substantiation rules', () => {
    expect(substantiationCategoryIds()).not.toContain('car');
  });

  it('excludes categories that are not work-related expenses', () => {
    const ids = substantiationCategoryIds();
    expect(ids).not.toContain('gifts-donations'); // D9
    expect(ids).not.toContain('tax-affairs'); // D10
  });

  it('includes every D5 category', () => {
    const ids = substantiationCategoryIds();
    const d5 = ACTIVE_CATEGORIES.filter((c) => c.myTaxLabel === 'D5');
    for (const category of d5) {
      expect(ids).toContain(category.id);
    }
  });

  it('never includes an inactive category', () => {
    const activeIds = ACTIVE_CATEGORIES.map((c) => c.id);
    for (const id of substantiationCategoryIds()) {
      expect(activeIds).toContain(id);
    }
  });
});

describe('categoryById', () => {
  it('finds a category', () => {
    expect(categoryById('tools-equipment')?.name).toBe('Tools & equipment');
  });

  it('returns null for an unknown id', () => {
    expect(categoryById('nope')).toBeNull();
  });

  it('finds Phase 3 categories too, so old data still resolves', () => {
    expect(categoryById('interest')?.myTaxLabel).toBe('D7');
  });
});
