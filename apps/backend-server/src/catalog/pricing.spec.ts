import { ModifierSelectionType, ModifierValidationReason } from '@hyperzod/shared-types';
import {
  ModifierValidationError,
  PricedProductInput,
  computeTotals,
  priceLine,
} from './pricing';

/**
 * The Cappuccino from PRODUCT_MAPPING §3.3, verbatim. If the document's
 * worked example stops holding, these tests are what says so.
 */
const cappuccino: PricedProductInput = {
  id: 'p1',
  name: 'Cappuccino',
  priceAmountCents: 40_000,
  groups: [
    {
      id: 'g-size',
      name: 'Size',
      selectionType: ModifierSelectionType.SINGLE,
      isRequired: true,
      minSelections: 1,
      maxSelections: 1,
      sortOrder: 1,
    },
    {
      id: 'g-milk',
      name: 'Milk',
      selectionType: ModifierSelectionType.SINGLE,
      isRequired: true,
      minSelections: 1,
      maxSelections: 1,
      sortOrder: 2,
    },
    {
      id: 'g-extras',
      name: 'Extras',
      selectionType: ModifierSelectionType.MULTIPLE,
      isRequired: false,
      minSelections: 0,
      maxSelections: 3,
      sortOrder: 3,
    },
  ],
  modifiers: [
    { id: 'm-small', groupId: 'g-size', name: 'Small', deltaPriceCents: -5_000, isActive: true },
    { id: 'm-regular', groupId: 'g-size', name: 'Regular', deltaPriceCents: 0, isActive: true },
    { id: 'm-large', groupId: 'g-size', name: 'Large', deltaPriceCents: 10_000, isActive: true },
    { id: 'm-whole', groupId: 'g-milk', name: 'Whole', deltaPriceCents: 0, isActive: true },
    { id: 'm-oat', groupId: 'g-milk', name: 'Oat', deltaPriceCents: 5_000, isActive: true },
    { id: 'm-shot', groupId: 'g-extras', name: 'Extra espresso shot', deltaPriceCents: 7_000, isActive: true },
    { id: 'm-foam', groupId: 'g-extras', name: 'Extra foam', deltaPriceCents: 0, isActive: true },
    { id: 'm-vanilla', groupId: 'g-extras', name: 'Vanilla syrup', deltaPriceCents: 3_000, isActive: true },
    { id: 'm-caramel', groupId: 'g-extras', name: 'Caramel syrup', deltaPriceCents: 3_000, isActive: true },
    { id: 'm-retired', groupId: 'g-extras', name: 'Discontinued syrup', deltaPriceCents: 3_000, isActive: false },
  ],
};

function reasonOf(fn: () => unknown): ModifierValidationReason {
  try {
    fn();
  } catch (err) {
    if (err instanceof ModifierValidationError) return err.reason;
    throw err;
  }
  throw new Error('expected a ModifierValidationError, but none was thrown');
}

describe('priceLine', () => {
  it('reproduces the worked example from the API contract', () => {
    // API_AND_EVENT_CONTRACTS §4.1: Regular + Oat + Extra shot, qty 2
    // => unit 52000, line 104000.
    const line = priceLine(cappuccino, 2, ['m-regular', 'm-oat', 'm-shot']);

    expect(line.unitPriceCents).toBe(52_000);
    expect(line.lineTotalCents).toBe(104_000);
    expect(line.selected).toHaveLength(3);
  });

  it('applies negative deltas', () => {
    const line = priceLine(cappuccino, 1, ['m-small', 'm-whole']);
    expect(line.unitPriceCents).toBe(35_000);
  });

  it('never returns a negative unit price', () => {
    const cheap: PricedProductInput = {
      ...cappuccino,
      priceAmountCents: 1_000,
    };
    const line = priceLine(cheap, 1, ['m-small', 'm-whole']);
    expect(line.unitPriceCents).toBe(0);
  });

  it('orders selected modifiers by group sort order, not client order', () => {
    const line = priceLine(cappuccino, 1, ['m-shot', 'm-oat', 'm-regular']);
    expect(line.selected.map((m) => m.groupName)).toEqual(['Size', 'Milk', 'Extras']);
  });

  it('rejects a missing required SINGLE group', () => {
    expect(reasonOf(() => priceLine(cappuccino, 1, ['m-regular']))).toBe(
      ModifierValidationReason.REQUIRED_GROUP_MISSING,
    );
  });

  it('rejects two selections in a SINGLE group', () => {
    expect(reasonOf(() => priceLine(cappuccino, 1, ['m-regular', 'm-large', 'm-whole']))).toBe(
      ModifierValidationReason.MULTIPLE_SELECTIONS_IN_SINGLE_GROUP,
    );
  });

  it('rejects exceeding max_selections on a MULTIPLE group', () => {
    expect(
      reasonOf(() =>
        priceLine(cappuccino, 1, [
          'm-regular',
          'm-whole',
          'm-shot',
          'm-foam',
          'm-vanilla',
          'm-caramel',
        ]),
      ),
    ).toBe(ModifierValidationReason.TOO_MANY_SELECTIONS);
  });

  it('rejects a modifier belonging to another product', () => {
    expect(reasonOf(() => priceLine(cappuccino, 1, ['m-regular', 'm-whole', 'not-ours']))).toBe(
      ModifierValidationReason.MODIFIER_NOT_IN_PRODUCT,
    );
  });

  it('rejects an inactive modifier', () => {
    expect(reasonOf(() => priceLine(cappuccino, 1, ['m-regular', 'm-whole', 'm-retired']))).toBe(
      ModifierValidationReason.MODIFIER_INACTIVE,
    );
  });

  it('rejects the same modifier submitted twice', () => {
    expect(
      reasonOf(() => priceLine(cappuccino, 1, ['m-regular', 'm-whole', 'm-shot', 'm-shot'])),
    ).toBe(ModifierValidationReason.DUPLICATE_MODIFIER);
  });

  it('rejects a non-integer or out-of-range quantity', () => {
    expect(() => priceLine(cappuccino, 0, ['m-regular', 'm-whole'])).toThrow(
      ModifierValidationError,
    );
    expect(() => priceLine(cappuccino, 1.5, ['m-regular', 'm-whole'])).toThrow(
      ModifierValidationError,
    );
    expect(() => priceLine(cappuccino, 100, ['m-regular', 'm-whole'])).toThrow(
      ModifierValidationError,
    );
  });

  it('allows an optional MULTIPLE group to be skipped entirely', () => {
    const line = priceLine(cappuccino, 1, ['m-regular', 'm-whole']);
    expect(line.unitPriceCents).toBe(40_000);
  });
});

describe('computeTotals', () => {
  it('sums line totals and leaves tax and delivery at zero in v1', () => {
    const totals = computeTotals([104_000, 40_000]);
    expect(totals).toEqual({
      subtotalCents: 144_000,
      deliveryFeeCents: 0,
      taxCents: 0,
      discountCents: 0,
      totalCents: 144_000,
    });
  });

  it('never returns a negative total', () => {
    const totals = computeTotals([1_000], { discountCents: 5_000 });
    expect(totals.totalCents).toBe(0);
  });
});
