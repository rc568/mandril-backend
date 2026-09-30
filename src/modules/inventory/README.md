# Inventory API and the future Warranty module

## Inventory queries

Administrators and employees can use:

- `GET /api/inventory/balances`: paginated variants with AVAILABLE, RESERVED, QUARANTINE and DEFECTIVE balances. Filters: `productVariantId`, `bucket`, `search` (SKU or product name). Missing balance rows are represented as zero with null audit fields; this never migrates legacy stock. Deleted variants are retained and marked with `deletedAt` or `productDeletedAt`.
- `GET /api/inventory/movements`: paginated history, newest first, with movement ID as a stable tiebreaker. Filters: `productVariantId`, `bucket` (source or destination), `search`, `type`, `orderId`, `supplierOrderId`, `createdBy`, `start` and `end` (inclusive ISO datetimes with timezone). Responses preserve the cost string, reason in `note`, source references, audit IDs and creator username. Historical records are included without rewriting them.

Both endpoints accept `page` (default 1) and `limit` (24, 48, 72 or 96; default 48). Balances paginate by variant, not by condition. Reads use a consistent database snapshot for their count and results.

## Manual adjustments

Administrators can call `POST /api/inventory/adjustments` with `productVariantId`, `bucket`, `countedQuantity` and a required `reason`. The count is the final quantity for AVAILABLE, QUARANTINE or DEFECTIVE; RESERVED remains controlled by sales.

The service locks the variant and updates the selected balance atomically with an ADJUSTMENT movement. The movement stores the absolute difference, its source or destination, the current `purchasePrice`, the reason and the authenticated user. The average purchase price is unchanged. If the count matches the balance, the response has `movement: null` and no movement is created. This also supports initial stock for new variants; legacy stock must be migrated separately.

Counts apply to the balance at the time the transaction executes. Concurrent counts are serialized; a later count replaces the earlier target. Physical counting should be coordinated with ongoing store operations.

## Approved returns

Order records commercial returns and exchanges that have already been approved. Completing them transfers the returned units into business-owned inventory. Inventory records quantities, conditions, cost snapshots and movements in the same transaction as the order status change.

The future Warranty module will decide eligibility, acceptance or rejection, and resolution (repair, replacement or refund). Receiving a customer's product for evaluation does not transfer ownership: Warranty must track custody separately, without adding it to inventory balances. `QUARANTINE` only represents business-owned units awaiting inspection.

For an approved return, `POST /api/orders/:id/complete` accepts a distribution for each returned order line:

```json
{
  "items": [
    { "orderProductId": "<returned-line-uuid>", "condition": "AVAILABLE", "quantity": 2 },
    { "orderProductId": "<returned-line-uuid>", "condition": "QUARANTINE", "quantity": 1 }
  ]
}
```

Each line must be fully distributed across AVAILABLE, QUARANTINE and/or DEFECTIVE. Quantities must be positive integers; duplicate line/condition pairs are rejected. A movement is recorded for each allocation. Only AVAILABLE quantities update the weighted purchase price, using the original sale's cost. RESERVED units already in the store remain part of the existing stock used in that average.

Order responses expose `returnConditions` as an array of condition/quantity pairs, derived from movements. Pending returns and sale lines have an empty array. The former singular `returnCondition` is replaced by this distribution.

Warranty evaluation, custody, and later inspection or condition changes are outside this implementation. A warranty claim must not automatically create a commercial return or add customer-owned goods to Inventory.
