-- ACUMULA: execute no Supabase SQL Editor, uma única vez.
-- Após criar manualmente seu usuário em Authentication > Users,
-- autorize apenas o UID dele: INSERT INTO public.allowed_users(user_id) VALUES ('UUID-DO-USUARIO');
-- Não rode o INSERT de exemplo sem substituir o UUID.

create extension if not exists pgcrypto;

create table if not exists public.allowed_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_cents bigint not null default 0 check (balance_cents between -999999999999 and 999999999999),
  theme text not null default 'light' check (theme in ('light', 'dark')),
  updated_at timestamptz not null default now()
);
create table if not exists public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_type text not null check (meal_type in ('almoco','janta')),
  meal_date date not null,
  meal_time time without time zone not null,
  budget_cents bigint not null check (budget_cents between 0 and 999999999999),
  spent_cents bigint not null check (spent_cents between 0 and 999999999999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, meal_date, meal_type)
);
create index if not exists meal_entries_user_date_idx on public.meal_entries(user_id, meal_date desc);

alter table public.allowed_users enable row level security;
alter table public.user_settings enable row level security;
alter table public.meal_entries enable row level security;

-- A lista de contas permitidas não é consultável diretamente por navegadores.
revoke all on public.allowed_users from anon, authenticated;
revoke all on public.user_settings from anon, authenticated;
revoke all on public.meal_entries from anon, authenticated;
grant select on public.user_settings to authenticated;
grant select on public.meal_entries to authenticated;

create or replace function public.acumula_authorized(uid uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$ select uid is not null and exists(select 1 from public.allowed_users where user_id=uid) $$;
revoke all on function public.acumula_authorized(uuid) from public, anon;
grant execute on function public.acumula_authorized(uuid) to authenticated;

create policy "select own authorized settings" on public.user_settings
for select to authenticated using (user_id=(select auth.uid()) and public.acumula_authorized((select auth.uid())));
create policy "select own authorized meals" on public.meal_entries
for select to authenticated using (user_id=(select auth.uid()) and public.acumula_authorized((select auth.uid())));

-- Cria perfil apenas para a conta da whitelist. Não altera perfil existente.
create or replace function public.acumula_initialize()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.acumula_authorized(auth.uid()) then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  insert into public.user_settings(user_id) values(auth.uid()) on conflict(user_id) do nothing;
end $$;

-- Saldo manual é uma substituição, sem reprocessar registros históricos.
create or replace function public.acumula_set_balance(p_balance bigint)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.acumula_authorized(auth.uid()) then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  if p_balance is null or p_balance < 0 or p_balance > 999999999999 then raise exception 'Saldo inválido'; end if;
  update public.user_settings set balance_cents=p_balance,updated_at=now() where user_id=auth.uid();
  if not found then raise exception 'Perfil não inicializado'; end if;
end $$;

create or replace function public.acumula_set_theme(p_theme text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.acumula_authorized(auth.uid()) then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  if p_theme is null or p_theme not in ('light','dark') then raise exception 'Tema inválido'; end if;
  update public.user_settings set theme=p_theme,updated_at=now() where user_id=auth.uid();
  if not found then raise exception 'Perfil não inicializado'; end if;
end $$;

-- Bloqueia a linha de saldo primeiro, serializando alterações em várias abas/dispositivos.
-- O UPDATE de perfil e INSERT/UPDATE da refeição pertencem à mesma transação RPC.
create or replace function public.acumula_save_meal(
  p_id uuid, p_type text, p_date date, p_time time without time zone,
  p_budget bigint, p_spent bigint, p_allow_negative boolean default false
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  old_spent bigint:=0;
  v_balance bigint;
  v_new_balance bigint;
  v_id uuid;
begin
  if not public.acumula_authorized(auth.uid()) then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  if p_type is null or p_type not in ('almoco','janta') or p_date is null or p_time is null
     or p_budget is null or p_spent is null or p_budget < 0 or p_spent < 0
     or p_budget > 999999999999 or p_spent > 999999999999 then
    raise exception 'Dados da refeição inválidos';
  end if;
  select balance_cents into v_balance from public.user_settings where user_id=auth.uid() for update;
  if not found then raise exception 'Perfil não inicializado'; end if;
  if p_id is not null then
    select spent_cents into old_spent from public.meal_entries
     where id=p_id and user_id=auth.uid() for update;
    if not found then raise exception 'Registro não encontrado'; end if;
  end if;
  v_new_balance := v_balance + old_spent - p_spent;
  if v_new_balance < 0 and not coalesce(p_allow_negative,false) then
    raise exception 'SALDO_INSUFICIENTE';
  end if;
  if v_new_balance < -999999999999 or v_new_balance > 999999999999 then
    raise exception 'Saldo excede o limite permitido';
  end if;
  if p_id is null then
    insert into public.meal_entries(user_id,meal_type,meal_date,meal_time,budget_cents,spent_cents)
      values(auth.uid(),p_type,p_date,p_time,p_budget,p_spent) returning id into v_id;
  else
    update public.meal_entries set meal_type=p_type,meal_date=p_date,meal_time=p_time,
      budget_cents=p_budget,spent_cents=p_spent,updated_at=now()
      where id=p_id and user_id=auth.uid();
    v_id:=p_id;
  end if;
  update public.user_settings set balance_cents=v_new_balance,updated_at=now() where user_id=auth.uid();
  return v_id;
end $$;

create or replace function public.acumula_delete_meal(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare old_spent bigint;v_balance bigint;
begin
  if not public.acumula_authorized(auth.uid()) then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  select balance_cents into v_balance from public.user_settings where user_id=auth.uid() for update;
  if not found then raise exception 'Perfil não inicializado'; end if;
  select spent_cents into old_spent from public.meal_entries where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'Registro não encontrado'; end if;
  if v_balance + old_spent > 999999999999 then raise exception 'Saldo excede o limite permitido'; end if;
  delete from public.meal_entries where id=p_id and user_id=auth.uid();
  update public.user_settings set balance_cents=balance_cents+old_spent,updated_at=now() where user_id=auth.uid();
end $$;

revoke all on function public.acumula_initialize() from public, anon;
revoke all on function public.acumula_set_balance(bigint) from public, anon;
revoke all on function public.acumula_set_theme(text) from public, anon;
revoke all on function public.acumula_save_meal(uuid,text,date,time without time zone,bigint,bigint,boolean) from public, anon;
revoke all on function public.acumula_delete_meal(uuid) from public, anon;
grant execute on function public.acumula_initialize() to authenticated;
grant execute on function public.acumula_set_balance(bigint) to authenticated;
grant execute on function public.acumula_set_theme(text) to authenticated;
grant execute on function public.acumula_save_meal(uuid,text,date,time without time zone,bigint,bigint,boolean) to authenticated;
grant execute on function public.acumula_delete_meal(uuid) to authenticated;
