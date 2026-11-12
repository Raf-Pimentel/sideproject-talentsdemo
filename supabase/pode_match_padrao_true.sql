-- Novos membros ja nascem com o "Sugerir conexoes" liberado (decisao do dono, 2026-11-11).
-- Para bloquear uma pessoa: update public.membro set pode_match = false where user_id = '...';
-- Membros existentes nao foram alterados.
alter table public.membro alter column pode_match set default true;
