import { OrderDto, OrderItemDto } from '@hyperzod/shared-types';
import { Order, OrderItem, OrderItemModifier } from '../database/entities';

export function toOrderDto(
  order: Order,
  items: OrderItem[],
  modifiers: OrderItemModifier[],
): OrderDto {
  const modifiersByItem = new Map<string, OrderItemModifier[]>();
  for (const modifier of modifiers) {
    const bucket = modifiersByItem.get(modifier.orderItemId);
    if (bucket) bucket.push(modifier);
    else modifiersByItem.set(modifier.orderItemId, [modifier]);
  }

  return {
    id: order.id,
    order_number: order.orderNumber,
    status: order.status,
    fulfillment_type: order.fulfillmentType,
    subtotal_cents: order.subtotalCents,
    delivery_fee_cents: order.deliveryFeeCents,
    tax_cents: order.taxCents,
    discount_cents: order.discountCents,
    total_cents: order.totalCents,
    currency_code: order.currencyCode,
    customer: {
      full_name: order.customerFullName,
      contact_email: order.customerContactEmail,
      contact_phone: order.customerContactPhone,
    },
    delivery_address: order.deliveryAddress,
    notes: order.notes,
    placed_at: order.placedAt.toISOString(),
    accepted_at: order.acceptedAt?.toISOString() ?? null,
    ready_at: order.readyAt?.toISOString() ?? null,
    dispatched_at: order.dispatchedAt?.toISOString() ?? null,
    delivered_at: order.deliveredAt?.toISOString() ?? null,
    cancelled_at: order.cancelledAt?.toISOString() ?? null,
    cancellation_reason: order.cancellationReason,
    items: items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => toItemDto(item, modifiersByItem.get(item.id) ?? [])),
  };
}

function toItemDto(item: OrderItem, modifiers: OrderItemModifier[]): OrderItemDto {
  return {
    id: item.id,
    product_id: item.productId,
    product_name: item.productName,
    unit_price_cents: item.unitPriceCents,
    quantity: item.quantity,
    line_total_cents: item.lineTotalCents,
    notes: item.notes,
    modifiers: modifiers.map((m) => ({
      group_name: m.groupName,
      modifier_name: m.modifierName,
      delta_price_cents: m.deltaPriceCents,
    })),
  };
}
