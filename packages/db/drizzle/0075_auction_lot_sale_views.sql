CREATE OR REPLACE VIEW public.auction_lot_sales WITH (security_invoker = true) AS
  SELECT l.*,
         COALESCE(l.final_sale_no, l.provisional_sale_no, s.target_sale_no, s.sale_no) AS assigned_sale_no,
         COALESCE(s.target_sale_no, s.sale_no) AS dispatch_sale_no,
         s.broker_id AS dispatch_broker_id,
         s.bundled_dispatch_id AS dispatch_bundle_id
  FROM public.auction_lots l
  JOIN public.auction_sales s ON s.id = l.sale_id;--> statement-breakpoint
CREATE OR REPLACE VIEW public.auction_lot_sales_current WITH (security_invoker = true) AS
  SELECT *
  FROM public.auction_lot_sales
  WHERE public.auction_sale_no_key(assigned_sale_no) = public.auction_sale_no_key(dispatch_sale_no);--> statement-breakpoint
GRANT SELECT ON public.auction_lot_sales TO authenticated, service_role;--> statement-breakpoint
GRANT SELECT ON public.auction_lot_sales_current TO authenticated, service_role;
