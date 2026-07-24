# Decisions, deviations and open questions

Everywhere the four specification documents were silent, ambiguous, or
internally inconsistent, this file records what was decided and why. Nothing
here was decided casually — each item changes behaviour a reader could
otherwise mistake for a bug.

---

## 1. Contradictions between documents

### 1.1 The self-delivery shortcut was unreachable

`HYPERZOD_PRODUCT_MAPPING.md` §1.4 lists **"Mark delivered (self-delivery
shortcut)"** as a Phase 1 capability. `HYPERZOD_MASTER_CONTEXT.md` §8's
transition table does not contain an edge that reaches `DELIVERED` without
passing through `OUT_FOR_DELIVERY`, which §8 itself says only comes online with
the delivery upsell. As written, the Phase 1 capability could not be performed.

**Resolved:** `READY_FOR_PICKUP → DELIVERED` is permitted, in both the trigger
and the TypeScript mirror. It also serves the pickup case ("customer collected").

**Confirm:** that this is the intended shortcut, rather than a separate
`COLLECTED` status.

### 1.2 Where the cart lives

`API_AND_EVENT_CONTRACTS.md` §4.1 says the cart is a field on the session's
Redis record. `HYPERZOD_PRODUCT_MAPPING.md` §6 gives it a dedicated
`cart:{tenantId}:{sessionId}` key with a 7-day TTL.

**Resolved:** the dedicated key. It carries the tenant in the key itself, and
expires on its own clock rather than riding the session's 30-day TTL.

### 1.3 Login cannot identify a user from email alone

`SYSTEM_DATA_DICTIONARY.md` §4.1 makes email unique **per tenant**, and
§2.3 of the API contract calls this intentional. But the login endpoint takes
only an email and a password, and the dashboard is served from one hostname —
so an email present at two tenants is ambiguous.

**Resolved:** `LoginDto` accepts an optional `tenant_slug`. Passwords are
verified against every candidate first; ambiguity is only reported to a caller
who already proved they know the password, so it leaks nothing. The response is
`409 TENANT_SELECTION_REQUIRED` with the candidate slugs.

---

## 2. Gaps filled

### 2.1 Order numbers

`API_AND_EVENT_CONTRACTS.md` §4.3 step 5 marks the format an assumption.

**Implemented:** `ORD-YYYYMMDD-NNNNN`, monotonic per (tenant, merchant, local
business day), allocated by `next_order_sequence()` — an atomic `INSERT … ON
CONFLICT DO UPDATE … RETURNING` against `order_number_counters`. The counter is
in Postgres rather than Redis specifically so a rolled-back checkout does not
burn a number.

The business day uses `tenants.timezone`, so a merchant's numbering rolls over
at their local midnight rather than UTC's.

### 2.2 Tax and delivery fees

Both are `[TBD region-dependent]` pending the launch-region decision
(`MASTER_CONTEXT` §9).

**Implemented:** `computeTotals()` takes them as parameters defaulting to zero,
with the TBD noted at the call site. A guessed GST/VAT rate would produce
confidently wrong receipts; zero is the only honest placeholder, and the seam
for the real rule is already in place.

### 2.3 Products that lost their category

`categories → products` is `ON DELETE SET NULL`, so a product can have no
category — but the menu contract is shaped as categories containing products,
with nowhere for an orphan to go.

**Implemented:** orphans appear in a synthetic trailing category
(`id: "uncategorized"`, name "More"). Silently dropping a sellable item from the
menu is a worse failure than an unlovely heading.

### 2.4 Session ownership of guest orders

§4.4 says "the session that placed the order can also fetch without a token",
but the data dictionary defines no `orders.session_id` column.

**Implemented:** a Redis SET, `session-orders:{tenantId}:{sessionId}`. Session
identity is not order data, so this keeps it out of the ledger. If you would
rather it be durable, the column is the cleaner answer.

### 2.5 Starter merchant status

`merchants.status` defaults to `PENDING_APPROVAL`, but KYC is Phase 2, so
nothing would ever approve it and every new signup would have a dead storefront.

**Implemented:** signup explicitly creates the starter merchant as `ACTIVE`.
Revisit when KYC lands.

---

## 3. Deviations from the documents

### 3.1 Domain events are emitted after COMMIT, not inside the handler

`MASTER_CONTEXT` §7.1 shows `orders.service` emitting `OrderCreatedEvent`
inline. Doing that literally publishes the SSE frame while the transaction is
still open: a dashboard reacting to the frame by fetching the order over REST
can find nothing, and a subsequent rollback would leave a published event for an
order that never existed.

**Implemented:** services call `TenantContext.enqueueEvent()`;
`RlsTransactionInterceptor` flushes the buffer only after `COMMIT`, and discards
it on rollback.

### 3.2 Composite foreign keys need a column list on SET NULL

A bare `ON DELETE SET NULL` on a composite FK nulls *every* referencing column,
including `tenant_id`, which is `NOT NULL`. Deleting a category or product would
have failed with a not-null violation.

**Implemented:** `ON DELETE SET NULL (category_id)` etc. This is why the schema
requires **PostgreSQL 15+**, not merely prefers it.

### 3.3 Two connection pools

`MASTER_CONTEXT` §3.3 names the roles but not where each is used. Tenant
resolution has to read `tenants` before a tenant is known, and signup creates
the tenant row itself — neither can run under RLS.

**Implemented:** `app_runtime` (NOBYPASSRLS, pool of 20) for every request
handler; `platform_admin` (BYPASSRLS, pool of 4) reachable only from
`TenantResolverService` and `AuthService`. The small pool is a deliberate
speed bump on a privileged path.

### 3.4 Merchant staff are tenant-scoped

§5.6 requires "the user must have permission for that merchant", but there is no
user↔merchant join table in the data dictionary, and per-module permissions are
Phase 3.

**Implemented:** `TENANT_ADMIN` sees all merchants in the tenant,
`MERCHANT_OWNER` only merchants they own, `MERCHANT_STAFF` all merchants in the
tenant. Tenant scoping is the honest v1 boundary; the join table is the fix.

---

## 4. Choices not dictated by the documents

| Choice | Rationale |
| --- | --- |
| npm workspaces, not pnpm/Turborepo | pnpm is not installed on this machine; swapping back is a `package.json` change |
| scrypt via `node:crypto` | Memory-hard, no native build step, no third-party dependency to audit. Parameters are embedded in the hash string so raising them later is a migration, not a flag day |
| Default `AUD` / `Australia/Sydney` / `en-AU` | Every worked example in the documents uses them. Overridable per tenant at signup and via env |
| Fixed-window rate limiting | Admits up to 2× the limit across a boundary. Accepted: these limits blunt abuse, they do not meter billing, and one `INCR` beats a sorted-set sliding window on the storefront read path |
| Four queries + in-memory join for the menu | A single joined query fans every product out by its modifier count. Four indexed reads in one transaction is cheaper and the assembly is legible |
| `forbidNonWhitelisted: true` | A client sending `price_amount_cents` to checkout is told no, rather than silently ignored while believing it set the price |

---

## 5. Still open

1. **Launch region and currency** — blocks payments, tax, and SMS sender IDs.
2. **Payment provider** — checkout currently ends at `PENDING` for merchant
   acceptance, as `API_AND_EVENT_CONTRACTS.md` §4.3 specifies for v1.
3. **Email provider** — signup verification and order confirmation are the two
   Phase 1 capabilities blocked on it. Deliberately not stubbed: an
   implementation that silently drops mail is worse than an obvious absence.
4. **Rename from `Hyperzod`** — flagged by `MASTER_CONTEXT` itself.
5. **`schema.sql` has never been executed.** There is no Postgres or Docker on
   this machine. It typechecks against nothing; run `npm run db:schema` against
   a real PostgreSQL 15 + PostGIS before trusting any of it.
