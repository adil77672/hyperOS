import {
  ModifierSelectionType,
  ModifierValidationReason,
} from '@hyperzod/shared-types';

/**
 * Server-side line pricing and modifier validation.
 *
 * PRODUCT_MAPPING §3.5 rule 5: "The client never sets prices. The client
 * submits { product_id, quantity, selected_modifier_ids[] }. The server
 * re-derives line_unit_price and line_total."
 *
 * Everything here is pure so it can be unit-tested without a database, and so
 * checkout and the cart preview provably agree — they call the same function.
 */

export interface PricedModifierInput {
  id: string;
  groupId: string;
  name: string;
  deltaPriceCents: number;
  isActive: boolean;
}

export interface PricedGroupInput {
  id: string;
  name: string;
  selectionType: ModifierSelectionType;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
}

export interface PricedProductInput {
  id: string;
  name: string;
  priceAmountCents: number;
  groups: PricedGroupInput[];
  modifiers: PricedModifierInput[];
}

export interface SelectedModifierResult {
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  deltaPriceCents: number;
}

export interface PricedLine {
  unitPriceCents: number;
  lineTotalCents: number;
  selected: SelectedModifierResult[];
}

export class ModifierValidationError extends Error {
  constructor(
    readonly reason: ModifierValidationReason,
    message: string,
    readonly context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ModifierValidationError';
  }
}

export const MAX_LINE_QUANTITY = 99;

export function priceLine(
  product: PricedProductInput,
  quantity: number,
  selectedModifierIds: readonly string[],
): PricedLine {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    throw new ModifierValidationError(
      ModifierValidationReason.TOO_MANY_SELECTIONS,
      `Quantity must be a whole number between 1 and ${MAX_LINE_QUANTITY}.`,
      { quantity },
    );
  }

  // Rule 4: a modifier the client names must belong to a group on THIS product.
  // Building the lookup from the product's own groups is what enforces it —
  // an id from another product simply is not in the map.
  const modifiersById = new Map(product.modifiers.map((m) => [m.id, m]));
  const groupsById = new Map(product.groups.map((g) => [g.id, g]));

  const seen = new Set<string>();
  const selected: SelectedModifierResult[] = [];
  const countByGroup = new Map<string, number>();

  for (const modifierId of selectedModifierIds) {
    if (seen.has(modifierId)) {
      throw new ModifierValidationError(
        ModifierValidationReason.DUPLICATE_MODIFIER,
        'The same option was selected twice.',
        { modifier_id: modifierId },
      );
    }
    seen.add(modifierId);

    const modifier = modifiersById.get(modifierId);
    if (!modifier) {
      throw new ModifierValidationError(
        ModifierValidationReason.MODIFIER_NOT_IN_PRODUCT,
        'That option is not available on this product.',
        { modifier_id: modifierId },
      );
    }
    if (!modifier.isActive) {
      throw new ModifierValidationError(
        ModifierValidationReason.MODIFIER_INACTIVE,
        'That option is no longer available.',
        { modifier_id: modifierId },
      );
    }

    const group = groupsById.get(modifier.groupId);
    if (!group) {
      throw new ModifierValidationError(
        ModifierValidationReason.MODIFIER_NOT_IN_PRODUCT,
        'That option is not available on this product.',
        { modifier_id: modifierId },
      );
    }

    countByGroup.set(group.id, (countByGroup.get(group.id) ?? 0) + 1);
    selected.push({
      id: modifier.id,
      groupId: group.id,
      groupName: group.name,
      name: modifier.name,
      deltaPriceCents: modifier.deltaPriceCents,
    });
  }

  // Rules 1-3, checked per group rather than per selection so that a missing
  // required group is caught — an absent selection has nothing to iterate.
  for (const group of product.groups) {
    const count = countByGroup.get(group.id) ?? 0;

    if (group.selectionType === ModifierSelectionType.SINGLE) {
      if (count > 1) {
        throw new ModifierValidationError(
          ModifierValidationReason.MULTIPLE_SELECTIONS_IN_SINGLE_GROUP,
          `Choose only one option for "${group.name}".`,
          { group_id: group.id, group_name: group.name, selected: count },
        );
      }
      if (group.isRequired && count === 0) {
        throw new ModifierValidationError(
          ModifierValidationReason.REQUIRED_GROUP_MISSING,
          `Choose an option for "${group.name}".`,
          { group_id: group.id, group_name: group.name },
        );
      }
      continue;
    }

    // MULTIPLE
    if (group.isRequired && count === 0) {
      throw new ModifierValidationError(
        ModifierValidationReason.REQUIRED_GROUP_MISSING,
        `Choose at least one option for "${group.name}".`,
        { group_id: group.id, group_name: group.name },
      );
    }
    // min_selections only binds once the group is in play: an optional group
    // with min 2 means "pick none, or at least two".
    if (count > 0 && count < group.minSelections) {
      throw new ModifierValidationError(
        ModifierValidationReason.TOO_FEW_SELECTIONS,
        `Choose at least ${group.minSelections} options for "${group.name}".`,
        {
          group_id: group.id,
          group_name: group.name,
          min_selections: group.minSelections,
          selected: count,
        },
      );
    }
    if (count > group.maxSelections) {
      throw new ModifierValidationError(
        ModifierValidationReason.TOO_MANY_SELECTIONS,
        `Choose at most ${group.maxSelections} options for "${group.name}".`,
        {
          group_id: group.id,
          group_name: group.name,
          max_selections: group.maxSelections,
          selected: count,
        },
      );
    }
  }

  const deltaSum = selected.reduce((sum, m) => sum + m.deltaPriceCents, 0);

  // Deltas are signed, so a stack of discounts could in principle go negative.
  // The DB has oi_price_chk (unit_price_cents >= 0); clamping here turns what
  // would be a 500 from a constraint violation into a free item.
  const unitPriceCents = Math.max(0, product.priceAmountCents + deltaSum);
  const lineTotalCents = unitPriceCents * quantity;

  // Keep display order stable and independent of the order the client sent.
  const groupSort = new Map(product.groups.map((g) => [g.id, g.sortOrder]));
  selected.sort(
    (a, b) => (groupSort.get(a.groupId) ?? 0) - (groupSort.get(b.groupId) ?? 0),
  );

  return { unitPriceCents, lineTotalCents, selected };
}

/**
 * Order totals. Kept separate from line pricing so tax and delivery rules can
 * change without touching modifier logic.
 */
export interface OrderTotals {
  subtotalCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
}

export function computeTotals(
  lineTotals: readonly number[],
  options: { deliveryFeeCents?: number; taxCents?: number; discountCents?: number } = {},
): OrderTotals {
  const subtotalCents = lineTotals.reduce((sum, line) => sum + line, 0);

  // [TBD] delivery fee: zone-based pricing is Phase 2 (PRODUCT_MAPPING §2), so
  // v1 charges nothing for merchant self-delivery.
  const deliveryFeeCents = options.deliveryFeeCents ?? 0;

  // [TBD] tax: API_AND_EVENT_CONTRACTS §4.3 leaves this "region-dependent —
  // VAT/GST rules" pending the launch-region decision (MASTER_CONTEXT §9).
  // Zero is the only honest placeholder; a guessed rate would produce
  // confidently wrong receipts.
  const taxCents = options.taxCents ?? 0;

  // Coupons are Phase 2 (PRODUCT_MAPPING §1.6).
  const discountCents = options.discountCents ?? 0;

  const totalCents = Math.max(
    0,
    subtotalCents + deliveryFeeCents + taxCents - discountCents,
  );

  return { subtotalCents, deliveryFeeCents, taxCents, discountCents, totalCents };
}
