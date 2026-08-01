-- One row per question asked, plus the rating it got back.
--
-- Run this once in the Supabase SQL editor.
--
-- This is the deliberate step past supabase/metrics.sql. That table is counters
-- with no timestamps and no content; this one stores question text, answer text
-- and a free-text reason, because "how many questions" cannot tell you WHICH
-- answers were bad. Still no IP, user agent, session id or account link — a row
-- says what was asked and how it landed, never who asked it.
--
-- The reason column is user-typed free text. Treat it as untrusted content:
-- reachable only via the service-role key, never rendered back to visitors.

create table if not exists public.qa_log (
  -- Minted by the server before streaming starts and handed to the browser in
  -- the answer's metadata line, so feedback can name the row it belongs to
  -- without the client being able to invent one that doesn't exist.
  id           uuid primary key,
  asked_at     timestamptz not null default now(),

  -- Which surface asked: 'rules' | 'how_it_works' | 'suggestions'. The last is
  -- a machine-built prompt, so keeping it separable stops it drowning the log.
  source       text not null,

  question     text not null,
  -- Null when retrieval failed before any generation happened.
  answer       text,
  -- 0 = the corpus had nothing and the assistant refused. Worth grepping for.
  chunks_used  integer,
  citations    jsonb not null default '[]'::jsonb,

  -- Null until someone rates it. Most rows stay null; that's expected.
  rating       text,
  reason       text,
  rated_at     timestamptz,

  constraint qa_log_rating_values
    check (rating is null or rating in ('great', 'bad')),

  -- The product rule, enforced where it can't be bypassed: every 'bad' carries
  -- a reason. 'great' may or may not.
  constraint qa_log_bad_needs_reason
    check (
      rating is distinct from 'bad'
      or (reason is not null and length(btrim(reason)) > 0)
    )
);

-- Reading is always "newest first" or "the rated ones" — index both.
create index if not exists qa_log_asked_at_idx on public.qa_log (asked_at desc);
create index if not exists qa_log_rating_idx on public.qa_log (rating) where rating is not null;

-- Reached only through the service-role key on the server, so RLS stays on with
-- no policies: anonymous clients can neither read questions nor write rows.
alter table public.qa_log enable row level security;
