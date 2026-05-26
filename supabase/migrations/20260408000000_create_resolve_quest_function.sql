-- Atominė funkcija, kuri gavus rezoliuciją (Už / Prieš laimėjo) perskirsto taškus nugalėtojams.
-- PATAISYTA: dabar registruoja bet_win ir bet_loss transakcijas Activity Log'ui.
create or replace function resolve_quest(
  p_quest_id uuid,
  p_resolution_is_positive boolean
)
returns json
language plpgsql
security definer
as $$
declare
  v_status text;
  v_bet record;
begin
  -- 1. Patikriname ar quest dar nėra išspręstas ir užrakiname jį
  select status into v_status
    from public.quests
   where id = p_quest_id
     for update;

  if not found then
    raise exception 'Užduotis nerasta' using errcode = 'P0001';
  end if;

  if v_status != 'open' then
    raise exception 'Užduotis jau yra uždaryta' using errcode = 'P0002';
  end if;

  -- 2. Atnaujiname quests statusą
  update public.quests 
     set status = case when p_resolution_is_positive then 'completed' else 'rejected' end,
         completed_at = now()
   where id = p_quest_id;

  -- 3. Atnaujiname lažybų statusą į won arba lost
  update public.bets
     set status = case when prediction_is_positive = p_resolution_is_positive then 'won' else 'lost' end
   where quest_id = p_quest_id
     and status = 'pending';

  -- 4. Paskirstome prizus laimėtojams
  update public.profiles p
     set balance = balance + (b.amount * b.coefficient)
    from public.bets b
   where b.quest_id = p_quest_id
     and b.profile_id = p.id
     and b.status = 'won';

  -- 5. Registruojame transakcijas kiekvienam laimėtojui ir pralaimėtojui (Activity Log)
  for v_bet in
    select id, profile_id, amount, coefficient, status
      from public.bets
     where quest_id = p_quest_id
       and status in ('won', 'lost')
  loop
    if v_bet.status = 'won' then
      insert into public.transactions (profile_id, amount, type, reference_id)
      values (v_bet.profile_id, (v_bet.amount * v_bet.coefficient)::integer, 'bet_win', v_bet.id);
    else
      insert into public.transactions (profile_id, amount, type, reference_id)
      values (v_bet.profile_id, 0, 'bet_loss', v_bet.id);
    end if;
  end loop;

  return json_build_object(
    'success', true,
    'quest_id', p_quest_id,
    'resolution', case when p_resolution_is_positive then 'completed' else 'rejected' end
  );
end;
$$;
