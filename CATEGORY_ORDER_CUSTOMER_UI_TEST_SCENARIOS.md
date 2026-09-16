# Dashboard UI — Category/Collection, Order, and Customer Modules: Test Scenario Matrices

Same conventions as the Login and Product matrices: `CAT-UI-###` /
`ORDER-UI-###` / `CUST-UI-###`, grouped by category, priority-ordered within
each module (P0 = do first, highest signal; P2 = lower priority/stretch).
Reuse `fixtures/customer.js` and `fixtures/staff.js` for setup wherever a
test needs *existing* data — don't rebuild via UI clicks what the API
fixtures already build reliably. Watch the canvas-coordinate-fragility note
from `navigateToProduct` — Orders in particular will have a large seeded
dataset (`populatedb`'s historical orders); confirm scroll/pagination
handling before assuming the same click-math approach works unmodified.

---

## 4.3 Category & Collection Management UI

### A. Category — Create (P0)

- **CAT-UI-001** `should create a top-level category with required fields via the UI`
- **CAT-UI-002** `should auto-generate the slug from the category name`
  — same Saleor auto-slugify behavior already proven for products; cross-check
  `product_category.slug`.
- **CAT-UI-003** `should derive description_plaintext correctly from rich-text input`
  — same Editor.js-shape gotcha as products; verify against
  `product_category.description`/plaintext-equivalent column.
- **CAT-UI-004** `should create a nested (child) category under an existing parent`
  — categories support parent/child hierarchy; confirm `product_category.parent_id`
  is set correctly and the UI's breadcrumb/tree reflects it.

### B. Category — Validation (P1)

- **CAT-UI-005** `should show a validation error when the category name is empty`
- **CAT-UI-006** `should not fire a categoryCreate request when validation fails`
  — `page.route()` observer pattern, same as PROD-UI-007.
- **CAT-UI-007** `should show a specific error when saving a duplicate slug`

### C. Category — Update (P0)

- **CAT-UI-008** `should update the category name and reflect it immediately in the UI`
- **CAT-UI-009** `should NOT change the slug when only the name is updated`
- **CAT-UI-010** `should advance updated_at while created_at stays fixed`
  (if `product_category` has both columns — confirm first, don't assume
  symmetry with `product_product`)

### D. Category — Delete (P0)

- **CAT-UI-011** `should require confirmation before deleting a category`
- **CAT-UI-012** `should remove the category from the list after deletion`
- **CAT-UI-013** `should actually delete the row, not soft-delete`
- **CAT-UI-014** `should determine what happens to products still assigned to a deleted category`
  — **open question worth resolving empirically before writing the
  assertion**: does deletion get blocked while products are assigned, does
  it cascade-null the products' `category_id`, or does it cascade-delete the
  products themselves? Check Saleor's actual behavior first (test manually
  once), then write the test to match reality rather than assuming.

### E. Collection — Create/Update/Delete (P0)

Same CRUD depth as Category, mirrored:

- **CAT-UI-015** `should create a collection with required fields`
- **CAT-UI-016** `should auto-generate the collection slug from its name`
- **CAT-UI-017** `should update a collection's name and description`
- **CAT-UI-018** `should delete a collection without deleting its member products`
  — confirms `product_collectionproduct` rows are removed but
  `product_product` rows survive; direct DB check.

### F. Collection — Channel Listing (P0)

Collections have their own `isPublished`/channel-visibility, independent of
member products' own channel listings — same class of finding as Phase 1's
product/channel investigation, worth confirming rather than assuming
symmetry.

- **CAT-UI-019** `should toggle a collection's published status for a channel`
- **CAT-UI-020** `should reflect channel-listing changes in product_collectionchannellisting immediately`

### G. Collection — Product Assignment (P0)

- **CAT-UI-021** `should add a product to a collection via the UI`
- **CAT-UI-022** `should remove a product from a collection via the UI`
- **CAT-UI-023** `should reflect assignment changes in product_collectionproduct immediately`
- **CAT-UI-024** `should allow the same product to belong to multiple collections`

### H. List / Search / Filter (P1)

- **CAT-UI-025** `should list all seeded categories on the Categories page`
- **CAT-UI-026** `should list all seeded collections on the Collections page`
- **CAT-UI-027** `should search categories by name`
- **CAT-UI-028** `should filter collections by channel`

### I. RBAC (P1)

- **CAT-UI-029** `should allow the limited-access (MANAGE_PRODUCTS-only) staff to manage categories/collections via the UI`
  — MANAGE_PRODUCTS scope in Saleor typically covers categories/collections
  too; confirm this assumption directly rather than guessing (check Docs or
  just try it) before writing the test as a positive assertion.

---

## 4.4 Order Management UI

This module leans hardest on the **hybrid pattern** — `checkout.spec.js`'s
proven API fixtures seed a real order in milliseconds; these tests exercise
only the UI's display and management of that order, never rebuild checkout
via browser clicks.

### A. Locate & Display Seeded Order (P0 — build first, everything else depends on being able to find the order)

- **ORDER-UI-001** `should locate the checkout.spec.js-seeded order in the Orders list`
  — likely needs search-by-order-number or search-by-customer-email, given a
  large pre-existing seeded dataset; confirm the canvas-grid navigation
  approach handles this (may need scrolling/pagination unlike Product's
  small test set).
- **ORDER-UI-002** `should display the correct order number matching order_order.number`
- **ORDER-UI-003** `should display the correct line items (product name, variant, quantity) matching order_orderline`
- **ORDER-UI-004** `should display the correct order total matching order_order.total_gross_amount`
- **ORDER-UI-005** `should display the correct customer email/name matching the order's linked user`
- **ORDER-UI-006** `should display the correct payment/charge status (Fully charged, per Phase 1's confirmed FULL chargeStatus)`

### B. Fulfillment (P0)

- **ORDER-UI-007** `should mark an order as fulfilled via the UI`
- **ORDER-UI-008** `should reflect the fulfillment in the order_fulfillment table`
- **ORDER-UI-009** `should support partial fulfillment (fulfilling only some line items)`
- **ORDER-UI-010** `should update the order's overall status after fulfillment (UNFULFILLED → FULFILLED/PARTIALLY_FULFILLED)`
  — direct DB cross-check against `order_order.status`.

### C. Order Search & Filtering (P0)

- **ORDER-UI-011** `should search orders by order number`
- **ORDER-UI-012** `should search orders by customer email`
- **ORDER-UI-013** `should filter orders by status (unfulfilled/fulfilled/etc.)`
- **ORDER-UI-014** `should filter orders by channel`
- **ORDER-UI-015** `should filter orders by date range`

### D. Order Modification (P1)

- **ORDER-UI-016** `should add a note/comment to an order via the UI`
- **ORDER-UI-017** `should cancel an order via the UI`
- **ORDER-UI-018** `should reflect cancellation in order_order.status and confirm stock/payment side effects`
  — worth checking whether cancellation releases reserved stock and/or
  triggers a refund attempt; confirm actual behavior before asserting.

### E. Refunds & Payment Display (P1)

- **ORDER-UI-019** `should display payment transaction details matching payment_payment/payment_transaction`
- **ORDER-UI-020** `should support issuing a refund via the UI (dummy gateway)`
  — reuse Phase 1's confirmed dummy-gateway token behavior
  (`token: "Fake"`-equivalent doesn't validate content) if the refund flow
  needs a similar arbitrary token.

### F. Pagination / Large Dataset Handling (P0 — do NOT skip given known seed data volume)

- **ORDER-UI-021** `should paginate correctly through the full seeded order list`
- **ORDER-UI-022** `should navigate to an order located beyond the first page/scroll position`
  — this is the concrete test that will surface whether the canvas-grid
  coordinate-math approach (flagged as fragile in the Product module review)
  actually breaks under real scroll/pagination conditions. Treat this as
  the first real stress-test of that pattern.

### G. RBAC (P1)

- **ORDER-UI-023** `should hide or restrict Order management for the limited-access (MANAGE_PRODUCTS-only) staff`
  — Orders requires `MANAGE_ORDERS`, which the limited-access account does
  NOT have; this should be a denial/hidden-nav test, unlike Category's likely
  positive-access test.

---

## 4.5 Customer Management UI

### A. List & Locate (P0)

- **CUST-UI-001** `should list the fixture-seeded testCustomer in the Customers page`
  — reuse `fixtures/customer.js`'s `testCustomer` for setup.
- **CUST-UI-002** `should search customers by email`
- **CUST-UI-003** `should search customers by name`

### B. Customer Detail View (P0)

- **CUST-UI-004** `should display correct customer details matching account_user`
  (email, first/last name, date joined, is_active, is_confirmed)
- **CUST-UI-005** `should display the customer's order history, if any`
  — good candidate to chain with the Order module: seed a customer via
  `testCustomer`, then run a checkout as that customer via Phase 1's
  `checkout.spec.js` fixtures, confirm the resulting order appears on this
  customer's detail page.
- **CUST-UI-006** `should display the customer's saved addresses, if any`

### C. Customer Edit (Staff-Side) (P0)

- **CUST-UI-007** `should update a customer's name via the UI`
- **CUST-UI-008** `should reflect the edit in account_user immediately`
- **CUST-UI-009** `should deactivate a customer account via the UI`
  — toggles `is_active`; confirm whether this blocks the customer's own
  login (worth a follow-on check: attempt `tokenCreate` as that customer via
  a direct API call after deactivation, confirm it's rejected).
- **CUST-UI-010** `should reactivate a previously deactivated customer account`

### D. Customer Deletion (Staff-Side) (P0)

- **CUST-UI-011** `should delete a customer via the UI`
- **CUST-UI-012** `should require confirmation before deleting a customer`
- **CUST-UI-013** `should actually delete the row from account_user, not soft-delete`
  — note: confirm this doesn't conflict with any `PROTECT`-style FK
  constraint from `order_order.user_id` if the customer has existing orders
  (flagged as an open question back in the checkout-flow work); if deletion
  is blocked for customers with orders, that's a legitimate finding to
  assert on rather than a bug.

### E. Validation (P1)

- **CUST-UI-014** `should show a validation error when saving an invalid email format`
- **CUST-UI-015** `should show a specific error when saving a duplicate email`

### F. RBAC (P1)

- **CUST-UI-016** `should hide or restrict Customer management for the limited-access (MANAGE_PRODUCTS-only) staff`
  — Customers requires `MANAGE_USERS`, not held by the limited-access
  account; denial/hidden-nav test, same shape as ORDER-UI-023.

---

## Cross-Module Priority Summary

If time-constrained, build in this order across all three modules:
1. Category/Collection CRUD + channel listing + product assignment (A, C, D, E, F, G above) — high DB-cross-check value, low risk (small dataset, no pagination concerns).
2. Order location/display/fulfillment/search (A, B, C above) — highest real-world value, but do ORDER-UI-021/022 (pagination stress-test) early, not last, since it determines whether `navigateToProduct`-style navigation needs rework before building the rest of the module on top of it.
3. Customer list/detail/edit/delete (A, B, C, D above).
4. RBAC-denial tests for Order and Customer (lower priority individually, but cheap once the modules themselves work — reuse the Option A/B fixture pattern established for Product's RBAC section).
5. Validation/negative-case scenarios (B in Category, E in Customer) — same reasoning as Login/Product: lowest marginal signal, do last.
