# Auction & Settlement — Feature Specification

> Canonical spec for the Colombo tea-auction flow (the A-track wedge). Written to
> be read by both humans and AI agents: every rule is concrete and enumerated,
> every formula has a worked example, and the invariants in §9 map 1:1 onto
> tests. If this file and the code ever disagree, treat the **invariants (§9)** as
> the contract and fix whichever side is wrong.
>
> **Scope now:** auction sales only, with clean separation from other money flows.
> Supplier payments and non-auction purchases are explicitly out of scope and slot
> in later via the `flow` tag (§5).
>
> **Source artifacts** (real customer data this spec is verified against):
> `~/Desktop/custo-tokanizer-onix/ktf-auc-fll/` — Sale `2026-023`, sold 17 Jun 2026,
> broker **BPML Produce Marketing**, seller **Kumudu Tea Factory**, marks
> `MF1530 KUMUDU` + `MF1530A ITTAPANA`. Files: `MF1530 Ack BPML 23.pdf`
> (Acknowledgement), `MF1530 Valuation BPML 23.pdf` (Valuation), `MF1530 Sellers
> Contract BPML 23.pdf` (Sellers Contract & Account Sales), `Bank Transaction
> Details.csv` (bank statement).

---

## 1. Glossary

| Term | Meaning |
|---|---|
| **Factory / Seller** | The tenant. Produces and invoices tea. (e.g. Kumudu Tea Factory) |
| **Broker** | The auction house that catalogues, values, sells, and settles on the factory's behalf. (e.g. BPML Produce Marketing) |
| **Mark / Estate mark** | A selling identity a factory trades under. One factory may have several. (e.g. `MF1530 KUMUDU`, `MF1530A ITTAPANA`) |
| **Buyer** | Exporter/trader who buys lots at auction. Has a VAT number. |
| **Sale** | A weekly auction event, identified by a **sale no.** (e.g. `2026-023`). |
| **Contract** | One settlement document per mark within a sale, identified by a **contract no.** (e.g. `2026/023/0110`). |
| **Lot** | A parcel of one grade offered as a unit — N bags × kg/bag. The central object; it moves through the state machine. |
| **Invoice no.** | The factory's own reference for a lot when it dispatches it (e.g. `0058`). |
| **Lot no.** | The catalogue number the broker assigns to a lot for the sale (e.g. `0477`). |
| **Grade** | Tea grade: OP, OP1, OPA, PEK, PEK1, BM, … |
| **Gross / Sample allowance / Net weight** | `net = gross − sample_allowance`. The sample allowance is tea drawn for tasting ("for viewing purpose only"); buyers pay on **net**. |
| **Valuation** | The broker's pre-sale estimate: a **price-per-kg range** + projected proceeds + a tasting note. |
| **Shutout / Violation** | A lot the factory invoiced that the broker did **not** catalogue for this sale (late arrival / over the storage norm). Stock stays at the warehouse and rolls to the next sale. |
| **Proceeds** | `net_kg × price_per_kg` — the hammer value of a lot before VAT and deductions. |
| **VAT** | 18%. Collected from the buyer **on the seller's behalf**; the factory remits it to the government. |
| **Bank Guarantee (YES/NO)** | Per sold lot. `NO` = buyer paid VAT up-front in **cash**. `YES` = VAT is **deferred**, secured by a bank guarantee, realised later. (Follow the document's column meaning — do not invert.) |
| **Account Sales / Settlement** | The broker's deduction stack applied to proceeds, yielding **Net Proceeds** and **Total Net Proceeds**. |
| **Prompt date** | The date the broker pays Total Net Proceeds to the factory's bank. |
| **Out-turn, grades** | Production-side concepts (deferred milestones M7/M8); the valuation tasting note is the future link to them. |

---

## 2. Actors & the document chain

```
Factory ──invoice & dispatch──▶ Broker warehouse
Broker  ──Acknowledgement PDF──▶ Factory   (catalogues lots / lists shutouts)
Broker  ──Valuation PDF───────▶ Factory   (price range + tasting notes)
Broker  ──Sellers Contract PDF▶ Factory   (buyers, actual prices, VAT, deductions)
Broker  ──Total Net Proceeds──▶ Factory bank account (on prompt date)
Bank    ──statement CSV───────▶ Factory   (proof the cash arrived)
```

The three broker documents arrive **by email as PDFs with a clean text layer**
(parse directly, **no OCR**). The bank statement is a **CSV** downloaded from the
factory's bank.

---

## 3. Lifecycle & state transitions

A **lot** is the spine. Each document advances its state and asserts one
reconciliation.

> **Dispatch-first model.** The factory does **not** create a sale. It
> **dispatches** lots to a 3rd-party store first; the broker later catalogues a
> **subset** (acknowledgements are *partial*) → values → sells; unsold lots are
> **re-printed** (re-sampled, slight kg loss) and roll to the next sale ~3 weeks
> later. So the lot's first state is `dispatched` (was `invoiced`), a dispatched
> lot absent from the *current* ack is `pending` (not an error — may roll
> forward), and an unsold lot becomes `re-print`. `missing` is only ever set by an
> explicit human decision in the orphan resolver, never by the reconciliation.

```mermaid
stateDiagram-v2
    [*] --> Dispatched: factory invoices & dispatches lot to the store
    Dispatched --> GRN: store sends good-receive notice (PDF automation later)
    GRN --> Catalogued: Acknowledgement confirmed — lot_no assigned, net wt matches  [Recon ①]
    Dispatched --> Catalogued: Acknowledgement confirmed before GRN is recorded
    Dispatched --> Pending: dispatched but absent from this (partial) ack  [Recon ①]
    Dispatched --> Shutout: Acknowledgement lists shutout / violation  [Recon ①]
    Pending --> Catalogued: catalogued by a later ack
    Pending --> Missing: explicit human decision — expected & overdue, no counterpart
    Catalogued --> Valued: Valuation Report confirmed
    Valued --> Sold: Sellers Contract confirmed — buyer + actual price  [Recon ②, ③]
    Valued --> Reprint: unsold — re-sampled, rolls to the next sale
    Valued --> Withdrawn: catalogued & valued but absent from the contract
    Sold --> Settled: Total Net Proceeds matched to a bank credit  [Recon ④]
    Settled --> BrokerStatement: broker statement received after settlement
    Reprint --> [*]: a fresh dispatched lot is created under the next sale
    Shutout --> [*]: rolls to next sale (re-dispatched)
    Withdrawn --> [*]
    BrokerStatement --> [*]
```

| From | To | Trigger (document) | Guard / assertion | Recon | Notes |
|---|---|---|---|---|---|
| — | `invoiced` | Factory action | invoice_no, grade, bags, kg/bag recorded | — | Lot dispatched to warehouse; surface entry-time warnings such as below-minimum net kg |
| `draft` | `grn` | Store GRN | Good-receive notice received | — | Dispatch-level stage; PDF parsing and automatic transition land later |
| `invoiced` | `catalogued` | Acknowledgement | invoice_no found in catalogue; `net_wt` matches invoice | ① | `lot_no` assigned |
| `invoiced` | `shutout` | Acknowledgement | invoice_no found in shutout/violation section | ① | Records `shutout_reason`, net wt; un-realized stock |
| `catalogued` | `valued` | Valuation | lot_no found; `price_min ≤ price_max`; projected proceeds present | — | Tasting note stored |
| `valued` | `sold` | Sellers Contract | lot_no found; buyer resolved; `proceeds == round(net_wt × price_per_kg, 2)` | ②, ③ | Creates `sale_line` + VAT ledger entry |
| `valued` | `withdrawn` | Sellers Contract (absence) | lot catalogued/valued but no contract line | — | Unsold / withdrawn at auction |
| `sold` | `settled` | Bank CSV | contract's Total Net Proceeds matched to a credit (full or ex-guarantee) | ④ | Guarantee-VAT may settle later |
| `settled` | `broker_statement` | Broker statement | Final broker statement received | — | Dispatch-level post-settlement stage |

**Invariant:** a lot is in exactly one state. Allowed transitions are only those
above; anything else is a bug. Re-ingesting a document is idempotent (§6) and must
not move a lot backwards.

---

## 4. The four reconciliations (the product)

Each is a deterministic, testable calculation. Worked figures are from Sale 023.

### ① Invoice ↔ Acknowledgement
- **Answers:** did everything the factory invoiced get catalogued, at the right weight?
- **Inputs:** `lots` (state `invoiced`) vs the parsed Acknowledgement (catalogued + shutout rows).
- **Algorithm:** for each dispatched lot, find any of its `invoice_no`(s) in the Acknowledgement →
  - in catalogued section → `catalogued`; assert `net_wt` equal (flag weight delta);
  - in shutout section → `shutout` with reason; surface as un-realized stock;
  - absent from both → **`pending`** (partial ack — may be catalogued later or roll
    to a later sale; **not** an error). `missing` is only set by an explicit human
    decision in the orphan resolver.
  Also flag any catalogued/shutout row with no matching invoice (broker added something unexpected).
- **Orphan resolver:** the ambiguous rows (`pending` invoiced lots ↔ `unexpected`
  catalogue lots) are reconciled manually in a **Compare** panel: candidates are
  ranked by a transparent per-dimension score (grade family, Δkg, lot proximity),
  nothing auto-links, and every link/mark is written to `auction_audit` with the
  filed Δkg. Same pattern reused for recon ④ (unattributed credit ↔ unpaid
  settlement, scored on amount / date / narration).
- **Outputs / flags:** `catalogued`, `shutout`, `weight_mismatch`, `pending`, `unexpected_catalogue_row`.
- **Sale 023:** 12 lots catalogued (11 under `MF1530`, 1 under `MF1530A`); invoices **`0061`** (OPA, 200 kg) and **`0063`** (OPA, 230 kg) shut out → 430 kg of stock rolls to the next sale.

### ② Valuation ↔ Sale price
- **Answers:** how did the hammer price compare to the broker's estimate?
- **Inputs:** `valuations` (`price_min`, `price_max`) vs `sale_lines` (`price_per_kg`).
- **Algorithm (per lot):**
  - `price_per_kg < price_min` → **below**
  - `price_min ≤ price_per_kg ≤ price_max` → **within**
  - `price_per_kg > price_max` → **above**
  - `variance = proceeds − projected_proceeds` (projected uses **low end × net_wt**).
- **Aggregate:** realised avg vs valuation avg, per grade and per sale.
- **Sale 023:** 10 of 11 lots **above** range, 1 at point; valuation avg **1,518.35/kg → sold 1,656.70/kg (+9.1%)**; projected ≈ 4.51M → actual **4,920,400** (+~410K). Tasting notes (e.g. "Grayish, mixed with short particles") are retained for the future grades link.

### ③ VAT split & remittance
- **Answers:** how much VAT is cash-in-hand vs secured on guarantee, and what's owed to government?
- **Inputs:** `sale_lines` (`vat_amount`, `on_guarantee`), `broker_rates` (charges VAT), `vat_ledger`.
- **Algorithm:**
  - per line: `vat_amount = round(proceeds × 0.18, 2)`; `mode = on_guarantee ? guarantee : cash`.
  - `cash_vat = Σ vat_amount where mode = cash`; `guaranteed_vat = Σ vat_amount where mode = guarantee`.
  - `output_vat = cash_vat + guaranteed_vat` (auction flow).
  - `input_vat = Σ broker charges-VAT` (the broker's VAT on its own fees — auction input VAT).
  - `net_vat_payable = output_vat − input_vat`.
  - Track guarantee realisation dates; flag overdue guarantees.
- **Sale 023 (both contracts):** `output_vat = 885,672 + 46,440 = 932,112`; guaranteed `166,860` (lots **`0481`** STASSEN 83,700 + **`0670`** EMPIRE 83,160), cash `765,252`; `input_vat = 11,026.15 + 681.28 = 11,707.43`; `net_vat_payable = 920,404.57`.
  - *Cash-basis vs accrual remittance timing is a tax-policy question for the factory's accountant; the ledger carries both the accrued liability and the cash position so either basis is reportable.*

### ④ Settlement ↔ Bank
- **Answers:** did the money actually arrive, and does it match the contract?
- **Inputs:** `settlements.total_net_proceeds` + `prompt_date` vs `bank_txns.credit`.
- **Algorithm (tolerant — broker VAT-remittance timing is not yet confirmed):** around the prompt date, try to match a credit to **either**
  - `total_net_proceeds` (full VAT included) → label **`full`**, or
  - `total_net_proceeds − guaranteed_vat` (cash VAT only) → label **`cash_only` (guarantee pending)**.
  Within a date window and amount tolerance; mark `matched` / `partial` / `unmatched`. Cheque reconciliation matches `bank_txns.cheque_no` to expected cheques.
- **Sale 023:** expected `5,733,046.98` (KUMUDU) + `299,898.85` (ITTAPANA) = **6,032,945.83**, due **24 Jun**. The sample statement ends **22 Jun** → recon ④ correctly reports **expected, not yet received (statement predates prompt date)**. Ex-guarantee fallback for KUMUDU = `5,733,046.98 − 166,860 = 5,566,186.98`.

---

## 5. Data model

**Conventions (apply to every table):** UUID primary key, **client-generated** so
records can originate offline; `factory_id uuid NOT NULL` + index; `created_at`,
`updated_at`; an RLS `factory_isolation` policy (`USING factory_id =
current_factory_id()` + matching `WITH CHECK`) created **in the same migration**.
**All money and weight columns are `numeric`, never `real`.** Entitlement key:
`auction` (A1–A3), `accounts` (A4).

**Naming:** auction transaction tables that would collide with or be ambiguous
against the deferred production tables are prefixed `auction_` (`auction_sales`,
`auction_lots`) — the repo already has a production `lots` table (graded tea,
referenced by `weighings`). Registry tables (`brokers`, `marks`, `buyers`) are
unprefixed. `auction_lots.grade` is **free-form text** (broker catalogue grades
vary), not the `tea_grade` enum.

```
brokers           id, factory_id, name, vat_no, address
broker_rates      id, factory_id, broker_id, effective_from(date),
                  insurance_per_kg, public_sale_ex_per_lot, brokerage_pct,
                  handling_per_kg, documentation_per_lot, eplatform_per_kg,
                  govt_relief_loan, charges_vat_pct(=18), proceeds_vat_pct(=18)
                  -- owner-editable, PER BROKER, effective-dated. Never hardcoded.
marks             id, factory_id, code, name, address          -- MF1530 KUMUDU
buyers            id, factory_id, name, vat_no
auction_sales     id, factory_id, broker_id, sale_no, sale_date, prompt_date,
                  status                                         -- one row per (broker, sale_no)
auction_lots      id, factory_id, sale_id, mark_id, invoice_no, lot_no, grade(text),
                  bags(int), kg_per_bag, gross_wt, sample_allowance, net_wt,
                  store, category, state, shutout_reason
                  -- invoice_no is the denormalized PRIMARY; lot_invoices is the
                  --   source of truth (a lot rarely carries >1 invoice). lot_no is
                  --   optional at dispatch (usually assigned at cataloguing).
                  -- state ∈ dispatched|catalogued|pending|missing|shutout|valued|
                  --         sold|re-print|withdrawn|settled
lot_invoices      id, factory_id, lot_id, invoice_no       -- 1 lot → 1..n invoices
auction_audit     id, factory_id, sale_id?, lot_id?, action, detail, reason, actor,
                  confidence_shown, weight_delta, created_at
                  -- every MANUAL recon decision (orphan link/mark, bank link) — the
                  --   filed Δkg on a link lives in weight_delta so it isn't lost
valuations        id, factory_id, lot_id, price_min, price_max,
                  projected_proceeds, tasting_note, valued_at
sale_lines        id, factory_id, sale_id, lot_id, buyer_id, gross_wt,
                  sample_allowance, net_wt, price_per_kg, proceeds, vat_amount,
                  on_guarantee(bool), proceeds_with_vat
settlements       id, factory_id, sale_id, contract_no, proceeds_total,
                  total_deductions, net_proceeds, output_vat, total_net_proceeds,
                  prompt_date
settlement_charges id, factory_id, settlement_id, code, label, basis, rate, amount
                  -- one row per deduction line (insurance, public_sale_ex,
                  --   brokerage, handling, documentation, charges_vat,
                  --   govt_relief_loan, eplatform). basis ∈ per_kg|per_lot|pct|flat
vat_ledger        id, factory_id, sale_line_id, flow, vat_amount, mode,
                  realised_date, guarantee_due_date, status
                  -- flow ∈ auction_output|auction_input  (room for future flows)
                  -- mode ∈ cash|guarantee ; status ∈ received|pending|remitted
bank_txns         id, factory_id, txn_date, description, debit, credit,
                  running_balance, cheque_no, raw_line, import_batch_id,
                  matched_settlement_id, match_status
doc_imports       id, factory_id, doc_type, source_filename, content_hash,
                  parsed_json, status, parsed_at, confirmed_at
                  -- doc_type ∈ acknowledgement|valuation|contract|bank_csv
                  -- status ∈ parsed|reviewed|confirmed|rejected
```

**Relationships:** `sales 1─*  lots 1─1 valuations`, `lots 1─0..1 sale_lines`,
`sales 1─* settlements 1─* settlement_charges`, `sale_lines 1─1 vat_ledger`,
`settlements 0..1─* bank_txns` (via matching). The `flow` tag on `vat_ledger` is
the seam that keeps auction VAT separate from later flows.

---

## 6. PDF / CSV ingestion design

**Pattern (every document type):** `parse → staging → review → confirm`.

1. **Receive** the file (broker PDF or bank CSV).
2. **Detect type** by header markers:
   - "Acknowledgement" → `acknowledgement`
   - "Valuation Report" → `valuation`
   - "TEA SELLERS CONTRACT & ACCOUNT SALES" → `contract`
   - CSV with bank columns → `bank_csv`
3. **Parse** with the type's parser (a pure `text → structured rows` function, one
   per doc type, isolated so a second broker's layout is an *additive* parser, never
   a rewrite). PDFs have a text layer → extract text directly, **no OCR**.
4. **Self-check** before allowing confirm — parse-integrity gates:
   - sum of parsed lot proceeds == the document's printed proceeds total;
   - parsed totals (net kg, lot count, VAT, total net proceeds) == printed totals;
   - recompute the contract math (§7) from `broker_rates` and compare to parsed
     deductions (flag drift, don't silently overwrite).
5. **Write to staging** (`doc_imports.parsed_json`, status `parsed`).
6. **Review screen** — side-by-side parsed values vs raw text, with the relevant
   reconciliation pre-computed so the reviewer sees mismatches before confirming.
7. **Confirm** → commit to domain tables and advance lot states. **Reject** →
   discard staging row; nothing touches domain tables.

**Idempotency:** dedupe on `content_hash` (+ `doc_type` + `sale_no`/`contract_no`).
Re-ingesting the same email is a no-op; a corrected re-import re-parses, diffs
against existing rows, and updates — never double-writes, never moves a lot
backwards. A mis-parse can therefore never write silently: it surfaces as a review
diff or a failed self-check.

---

## 7. Contract math (Account Sales)

Per contract, given `net_kg`, `lots` (count), `proceeds` (Σ sale-line proceeds),
and the broker's effective `broker_rates`. All steps round **half-up to 2 dp**.

```
insurance       = round(net_kg  × insurance_per_kg,       2)
public_sale_ex  = round(lots     × public_sale_ex_per_lot, 2)
brokerage       = round(proceeds × brokerage_pct,          2)
handling        = round(net_kg  × handling_per_kg,         2)
documentation   = round(lots     × documentation_per_lot,  2)
charges_subtotal= insurance + public_sale_ex + brokerage + handling + documentation
charges_vat     = round(charges_subtotal × charges_vat_pct, 2)      -- 18%, broker's VAT on its fees
eplatform       = round(net_kg × eplatform_per_kg, 2)
govt_relief_loan= (per broker; 0 in Sale 023)
total_deductions= charges_subtotal + charges_vat + govt_relief_loan + eplatform
net_proceeds    = proceeds − total_deductions
output_vat      = round(proceeds × proceeds_vat_pct, 2)             -- 18%, collected from buyers on seller's behalf
total_net_proceeds = net_proceeds + output_vat                     -- what the broker pays the factory
```

**Per sale line:** `net_wt = gross_wt − sample_allowance`;
`proceeds = round(net_wt × price_per_kg, 2)`;
`vat_amount = round(proceeds × 0.18, 2)`;
`proceeds_with_vat = proceeds + vat_amount`.

**BPML rate card (Sale 023):** insurance `0.06/kg`, public sale ex. `87.87/lot`,
brokerage `1.00%`, handling `3.58/kg`, documentation `25.00/lot`, e-platform
`0.25/kg`, govt relief loan `0`, VAT `18%`.

### Worked example — Sale 023, reproduced to the cent

| Line | `MF1530 KUMUDU` (0110) | `MF1530A ITTAPANA` (0111) |
|---|--:|--:|
| Net kg / lots | 2,970.00 / 11 | 300.00 / 1 |
| Proceeds | 4,920,400.00 | 258,000.00 |
| 1 Insurance (0.06/kg) | 178.20 | 18.00 |
| 2 Public sale ex. (87.87/lot) | 966.57 | 87.87 |
| 3 Brokerage (1%) | 49,204.00 | 2,580.00 |
| 4 Handling (3.58/kg) | 10,632.60 | 1,074.00 |
| 5 Documentation (25/lot) | 275.00 | 25.00 |
| VAT 18% on 1–5 | 11,026.15 | 681.28 |
| e-Platform (0.25/kg) | 742.50 | 75.00 |
| **Total deductions** | **73,025.02** | **4,541.15** |
| **Net proceeds** | **4,847,374.98** | **253,458.85** |
| Output VAT (18%) | 885,672.00 | 46,440.00 |
| **Total net proceeds** | **5,733,046.98** | **299,898.85** |

Combined Total Net Proceeds = **6,032,945.83**, due on prompt date **24 Jun 2026**.

---

## 8. Worked sale-line examples (Sale 023, KUMUDU)

| Lot | Inv | Grade | Bags×kg | Gross | S/Allw | Net | Price/kg | Proceeds | VAT | Guarantee | Valuation | vs range |
|---|---|---|---|--:|--:|--:|--:|--:|--:|---|---|---|
| 0477 | 0058 | OP | 10×28 | 282.50 | 2.50 | 280.00 | 1,600 | 448,000 | 80,640 | NO | 1600 | within |
| 0478 | 0059 | OP | 10×24 | 242.50 | 2.50 | 240.00 | 1,500 | 360,000 | 64,800 | NO | 1350–1400 | above |
| 0480 | 0038 | OP1 | 10×26 | 262.50 | 2.50 | 260.00 | 2,350 | 611,000 | 109,980 | NO | 2000–2100 | above |
| 0481 | 0066 | OP1 | 10×30 | 302.50 | 2.50 | 300.00 | 1,550 | 465,000 | 83,700 | **YES** | 1450–1500 | above |
| 0670 | 0065 | PEK | 10×28 | 283.50 | 3.50 | 280.00 | 1,650 | 462,000 | 83,160 | **YES** | 1450–1500 | above |
| 0766 | 0044 | PEK1 | 10×34 | 343.50 | 3.50 | 340.00 | 2,050 | 697,000 | 125,460 | NO | 1900–1950 | above |

(Sample allowance is `0.25/bag` for OP/OP1/OPA and `0.35/bag` for PEK/PEK1/BM.)

---

## 9. Invariants & test assertions

Machine-checkable rules. Each becomes a fixture/unit test against Sale 023.

1. **Weight:** `net_wt == gross_wt − sample_allowance` (every lot & sale line).
2. **Proceeds:** `proceeds == round(net_wt × price_per_kg, 2)` (every sale line).
3. **Line VAT:** `vat_amount == round(proceeds × 0.18, 2)`.
4. **Catalogue tie:** `Σ sale_lines.proceeds == settlement.proceeds_total` per contract.
5. **Deductions:** each `settlement_charges.amount` equals its §7 formula from the
   effective `broker_rates`; `total_deductions == Σ charges`.
6. **Settlement:** `net_proceeds == proceeds_total − total_deductions`;
   `total_net_proceeds == net_proceeds + output_vat`.
7. **VAT split:** `output_vat == cash_vat + guaranteed_vat`;
   `guaranteed_vat == Σ vat_amount where on_guarantee`.
8. **Recon ① conservation:** every `invoiced` lot ends `catalogued` or `shutout`
   (or `missing`, flagged); `Σ catalogued.net_wt == printed catalogued total`.
9. **State machine:** only §3 transitions occur; ingestion never moves a lot backward.
10. **Sale 023 golden numbers:** KUMUDU TNP `5,733,046.98`; ITTAPANA TNP
    `299,898.85`; guaranteed VAT `166,860`; cash VAT `765,252`; net VAT payable
    `920,404.57`; shutouts `0061` + `0063` (430 kg).

---

## 10. Open items & assumptions

1. **Broker VAT-remittance timing (recon ④)** — unconfirmed whether the broker
   pays full VAT (incl. guaranteed lots) at prompt date or only cash VAT with the
   rest later. Sample bank statement predates the prompt date, so unobserved.
   **Handled by design:** recon ④ matches either amount and labels it; the first
   observed settlement confirms the broker's real behaviour, then we lock it in.
2. **Deduction rates** — owner-editable **per-broker** rate cards (effective-dated).
   Reconstruction uses configured rates and cross-checks against the parsed
   contract, flagging drift.
3. **VAT scope** — auction flow only for now (output VAT split cash/guarantee +
   broker charges-VAT as auction input VAT). Other flows (supplier payments,
   non-auction purchases) are out of scope; the `vat_ledger.flow` tag lets them
   join later as separate buckets so the government return sums across flows
   deliberately.

---

## Build sequence

See **[MILESTONES.md](../MILESTONES.md)** A-track: **A1** intake & cataloguing
(recon ①) → **A2** valuation & sale (recon ②) → **A3** VAT/deductions/settlement
(recon ③) → **A4** accounting + bank/cheque reconciliation (recon ④, Priority 2).
Domain context lives in **[PRODUCT.md](PRODUCT.md)** ("The Colombo auction &
settlement flow").
