
do $$
declare
  rec record;
  def text;
  inject text;
begin
  for rec in
    select * from (values
      ('public.quote_order(text,jsonb,text,text,boolean)'::regprocedure,'orders.quote',30,60),
      ('public.checkout_order(uuid,uuid)'::regprocedure,'orders.checkout',10,60),
      ('public.create_restaurant(text,text)'::regprocedure,'company.create',3,3600),
      ('public.add_restaurant_member(text,text,text)'::regprocedure,'company.member_add',20,600),
      ('public.remove_restaurant_member(text,uuid)'::regprocedure,'company.member_remove',20,600),
      ('public.save_restaurant_settings(text,jsonb)'::regprocedure,'company.settings',30,600),
      ('public.save_restaurant_product(text,text,text,text,text,integer,text,boolean,jsonb,jsonb)'::regprocedure,'company.product',120,600),
      ('public.advance_order(uuid,text,boolean)'::regprocedure,'orders.advance',60,60),
      ('public.submit_refund_request(uuid,text)'::regprocedure,'orders.refund_request',5,3600),
      ('public.decide_refund_request(uuid,boolean,text)'::regprocedure,'orders.refund_decide',30,60),
      ('public.submit_order_review(uuid,integer,integer,text)'::regprocedure,'orders.review',10,3600),
      ('public.reply_order_review(uuid,text)'::regprocedure,'orders.review_reply',30,60),
      ('public.create_order_delivery_offer(uuid,uuid,uuid,text)'::regprocedure,'delivery.offer',30,60),
      ('public.respond_order_delivery_offer(uuid,boolean)'::regprocedure,'delivery.offer_response',60,60),
      ('public.pilot_start_delivery(uuid)'::regprocedure,'delivery.start',20,60),
      ('public.pilot_confirm_delivery(uuid,text,boolean)'::regprocedure,'delivery.confirm',20,60),
      ('public.save_pilot_profile(text,text,text,boolean)'::regprocedure,'pilot.profile',10,600),
      ('public.submit_pilot_application(text,date,text,text,text,text)'::regprocedure,'pilot.submit',5,3600),
      ('public.review_pilot_application(uuid,boolean,text)'::regprocedure,'pilot.review',30,60)
    ) v(proc,scope,lim,win)
  loop
    select pg_get_functiondef(rec.proc) into def;
    if position('private.enforce_rate_limit' in def)=0 then
      inject:=E'\nbegin\n  perform private.enforce_rate_limit('
        ||quote_literal(rec.scope)||','||rec.lim||','||rec.win||E');\n';
      def:=regexp_replace(def,E'\nbegin\n',inject);
      execute def;
    end if;
  end loop;
end $$;
