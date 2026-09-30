# Supplier Order workflow

All endpoints below are under `/api/supplier-orders` and require an administrator or employee session. Schemas in `schemas/` define the request fields; services enforce state transitions and transactional business rules.

| Operation | Endpoint |
| --- | --- |
| List/create purchases | `GET /`, `POST /` |
| Read/update a purchase | `GET /:id`, `PATCH /:id` |
| Mark shipment/cancel | `POST /:id/in-transit`, `POST /:id/cancel` |
| Edit projected exchange rate | `PATCH /:id/projected-exchange-rate` |
| Add/edit/remove expenses | `POST /:orderId/expenses`, `PATCH /:orderId/expenses/:expenseId`, `DELETE /:orderId/expenses/:expenseId` |
| List/register packages | `GET /:orderId/receipts`, `POST /:orderId/receipts` |
| Read/review a package | `GET /:orderId/receipts/:receiptId`, `POST /:orderId/receipts/:receiptId/review` |
| Close arrivals | `POST /:orderId/close-receiving` |
| Calculate final costs | `POST /:orderId/calculate-costs` |
| Post a reviewed package | `POST /:orderId/receipts/:receiptId/post-to-inventory` |
| List/create/close issues | `GET /:orderId/issues`, `POST /:orderId/issues`, `POST /:orderId/issues/:issueId/close` |

## Operational sequence

1. Register an already-paid purchase in PREPARING. The tracking number belongs to the order, not the individual packages. Cancellation is allowed only while PREPARING.
2. Record shipment with `in-transit`. Register packages when they arrive. The backend assigns each package's `sequenceNumber` under a purchase lock.
3. The first arrival freezes purchase products, prices, supplier and expenses. Review each package independently, separating good and defective quantities and recording unexpected variants or compensations where applicable.
4. Close arrivals explicitly when no more packages are expected. RECEIVED does not imply that every review or inventory posting is complete.
5. Set the projected exchange rate when needed and calculate costs. Reviewed packages require final PEN costs before posting. Calculation and posting are separate actions; costs may be recalculated until they have been used in inventory, including downstream compensations.
6. Post each reviewed package once. Costs, balances, immutable movement snapshots and the variant's weighted purchase price are saved atomically. Posting can occur while the purchase is PARTIALLY_RECEIVED.

## Cost and stock boundaries

`calculatedUnitCost` is in the purchase currency. `calculatedUnitCostPen` uses the projected exchange rate when needed and adds 18% only when `includesIgv` is false. Expenses retain their USD/PEN amounts; the projected rate is not a substitute for the local expense conversion. The current legacy calculation remains isolated so future cost rules need not silently revalue posted purchases.

Purchased lines absorb allocated expenses. Surplus and wrong-model units enter at zero cost under the agreed policy. Compensation units use the cost of the original receipt linked through `sourceIssueId`. Unknown original costs must be resolved before posting.

Good received units enter AVAILABLE; defective units enter DEFECTIVE. The purchase-price average includes existing AVAILABLE + RESERVED and good incoming units. Defective incoming units retain their movement cost but do not participate in that average. Split packages for the same purchase line use the same resolved unit cost and create separate movements.

Historical purchases are not evidence of current stock. The Excel/JSON production seed, future Warranty evaluation/custody, marketplace allocation and revised accounting-cost rules are separate work. See [Inventory contracts](../inventory/README.md) and [legacy stock migration](../../shared/db/migrations/README.md) for the transition and its deferred column removal.
