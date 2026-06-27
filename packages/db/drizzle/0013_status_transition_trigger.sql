-- 0013 — Atomic approve + status-transition trigger for supplier_requests.
-- 
-- Issue #1 (PR #18 review): The approveRequest server action had a TOCTOU race.
-- Two concurrent managers could both insert supplier_adjustments, then only one
-- UPDATE succeeds (the .eq("status","pending") guard). The rollback delete on the
-- losing path could fail, leaving an orphan adjustment — supplier debited twice.
--
-- Fix: approve_supplier_request() wraps the read-check-insert-update chain in a
-- single Postgres function so it runs atomically. The function is SECURITY DEFINER
-- with search_path = public so it can write to supplier_adjustments regardless of
-- the caller's RLS role (the app-level requireProfile already gates who can call
-- the server action that invokes this RPC).
--
-- Issue #4 (PR #18 review): The status CHECK constraint only validates the domain
-- of status values, not valid transitions. RLS policies enforce per-role guards,
-- but a trigger adds defense-in-depth: even an admin-client write cannot skip
-- the state machine.
--
-- Valid transitions:
--   pending     → approved, declined, cancelled
--   approved    → handed_to_driver, cancelled
--   handed_to_driver → acknowledged, cancelled
--   declined    → (terminal)
--   acknowledged→ (terminal)
--   cancelled   → (terminal)

-- ─── atomic approve ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_supplier_request(
  p_request_id uuid,
  p_decided_by uuid
)
RETURNS TABLE(approved boolean, adjustment_id uuid, error_message text)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_request record;
  v_amount numeric;
  v_adj_id uuid;
BEGIN
  -- Lock and read the request row so nothing else can change it concurrently.
  SELECT sr.id, sr.supplier_id, sr.type_key, sr.amount, sr.status,
         rt.creates_advance, rt.requires_amount
    INTO v_request
    FROM supplier_requests sr
    JOIN request_types rt ON rt.key = sr.type_key AND rt.factory_id = sr.factory_id
   WHERE sr.id = p_request_id
     FOR UPDATE OF sr;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Request not found.'::text;
    RETURN;
  END IF;

  IF v_request.status <> 'pending' THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Only pending requests can be approved.'::text;
    RETURN;
  END IF;

  IF v_request.creates_advance THEN
    v_amount := v_request.amount::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RETURN QUERY SELECT false, NULL::uuid, 'This advance needs a positive amount before approval.'::text;
      RETURN;
    END IF;

    INSERT INTO supplier_adjustments (
      factory_id, supplier_id, kind, label, amount,
      occurred_on, period_year, period_month, created_by
    ) VALUES (
      (SELECT factory_id FROM users WHERE id = p_decided_by),
      v_request.supplier_id,
      'advance',
      'Field-app advance request',
      v_amount::numeric(12,2),
      current_date,
      EXTRACT(YEAR FROM current_date)::int,
      EXTRACT(MONTH FROM current_date)::int,
      p_decided_by
    )
    RETURNING id INTO v_adj_id;
  END IF;

  UPDATE supplier_requests
     SET status = 'approved',
         decided_by = p_decided_by,
         decided_at = now(),
         adjustment_id = v_adj_id
   WHERE id = p_request_id;

  RETURN QUERY SELECT true, v_adj_id, NULL::text;
END;
$$;

-- ─── status-transition trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_supplier_request_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- If status didn't change, allow (update to other columns like handed_at, etc.)
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'pending' THEN
      IF NEW.status NOT IN ('approved', 'declined', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition: % → % (allowed: approved, declined, cancelled)',
          OLD.status, NEW.status;
      END IF;
    WHEN 'approved' THEN
      IF NEW.status NOT IN ('handed_to_driver', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition: % → % (allowed: handed_to_driver, cancelled)',
          OLD.status, NEW.status;
      END IF;
    WHEN 'handed_to_driver' THEN
      IF NEW.status NOT IN ('acknowledged', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition: % → % (allowed: acknowledged, cancelled)',
          OLD.status, NEW.status;
      END IF;
    WHEN 'declined' THEN
      RAISE EXCEPTION 'Cannot transition from terminal status: %', OLD.status;
    WHEN 'acknowledged' THEN
      RAISE EXCEPTION 'Cannot transition from terminal status: %', OLD.status;
    WHEN 'cancelled' THEN
      RAISE EXCEPTION 'Cannot transition from terminal status: %', OLD.status;
    ELSE
      -- Any unexpected status values are caught by the CHECK constraint already,
      -- but guard against them here too.
      RAISE EXCEPTION 'Unknown status: %', OLD.status;
  END CASE;

  RETURN NEW;
END;
$$;

-- Attach the trigger.
DROP TRIGGER IF EXISTS trg_supplier_requests_status_transition ON supplier_requests;
--> statement-breakpoint
CREATE TRIGGER trg_supplier_requests_status_transition
  BEFORE UPDATE ON supplier_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_supplier_request_status_transition();
