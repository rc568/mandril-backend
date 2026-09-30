# Legacy inventory transition

This is an explicit data migration, not a seed or an automatic application startup task. It requires the current Drizzle schema (including inventory tables and `stock_movement.legacy_movement_id`) to be installed first. It does not install or migrate the Supplier Order schema itself.

## Preconditions and execution

1. Back up the target database and stop application writes during the transition. The migration locks orders, order lines, variants, balances and movements, with a five-second lock timeout.
2. Review the target DATABASE_URL and supply an existing audit user's UUID. Use the normal project environment configuration.
3. Run `pnpm inventory:migrate <user-uuid>` or append `--preview`. The default validates and prints the proposed balances without writing rows. Save and review that report.
4. After verifying the figures, run `pnpm inventory:migrate <user-uuid> --apply`. The migration revalidates under locks and writes everything in one transaction. Any failure rolls back all changes.
5. Compare AVAILABLE and RESERVED to the report, and verify delivery/cancellation of outstanding sales. A second execution is rejected; it never adds the balances again.

Do not apply this to the stale development data as a production baseline. Production's Excel/JSON import remains a separate task. In particular, a fresh seed must explicitly establish whether its input represents free or physical stock before considering this migration.

## Quantity and audit rules

The previous Order implementation deducted sales immediately, even in PENDING or PAID. Therefore `quantity_in_stock` is treated as free stock and copied to AVAILABLE unchanged. Outstanding SALE lines in PENDING/PAID become RESERVED. Completed/cancelled sales and pending exchanges/returns do not contribute reservations. No defective or quarantine stock is inferred.

Opening ADJUSTMENT movements record AVAILABLE + RESERVED as physical good stock, followed by RESERVATION movements transferring the reserved quantities out of AVAILABLE. Final balances are written directly within the same transaction, so the opening ledger and balances agree. Current purchase prices are preserved, including zero, without recomputing historical purchase costs.

Legacy movements remain unchanged. When an outstanding sale already has matching historical SALE movements, each new reservation points to its original through `legacyMovementId`. Inventory recognizes only matching linked legacy records as superseded for reservation arithmetic. Unrelated or unconverted legacy movements still block the sale's inventory operations. When an outstanding sale has no movement history (for example, a direct import), its lines supply the reservation quantities and the report requires review.

The migration rejects existing inventory balances or modern bucket movements rather than merging two incompatible sources. It also rejects negative/overflowing stock, empty or invalid outstanding sales, deleted outstanding sales, deleted/incompatible legacy movements, or mismatches between lines and historical movement quantities. Investigate these cases instead of guessing a correction.

## Deferred removal of the old column

`product_variant.quantity_in_stock` remains temporarily because the existing seed still writes it and the seed is outside this scope. Runtime purchasing, sales, returns, adjustments and queries already use inventory balances. Guards prevent treating nonzero unmigrated legacy stock as empty inventory.

After the production seed is explicitly adapted and every target database is migrated or initialized directly with balances, remove the legacy field from the Drizzle schema, remove the four unmigrated-stock guards, adapt their tests, and apply a reviewed schema migration dropping the column. Do not run `db:push` to drop it before preserving the input data. Keep legacy movement references for audit even after removing the old stock column.
