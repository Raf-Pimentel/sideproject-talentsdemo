-- Migration "fonte_dados" (applied 2026-11-10): record where each piece of data came from (docs/PRIVACIDADE.md rule 11).
-- Free text, e.g. 'LinkedIn (PDF), 2026-11-10'. Null = typed by the owner or imported from the original sheet.
alter table public.formacao add column fonte text;
alter table public.experiencia add column fonte text;
