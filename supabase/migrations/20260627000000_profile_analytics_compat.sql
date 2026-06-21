-- Compatibility support for language-isolated, read-only profile analytics.
-- Existing gameplay tables and functions remain otherwise unchanged.

alter table public.learning_words
  add column if not exists language text;

update public.learning_words
set language = 'zh'
where language is null or btrim(language) = '';

alter table public.learning_words
  alter column language set default 'zh',
  alter column language set not null;

alter table public.learning_words
  drop constraint if exists learning_words_expression_key;

create unique index if not exists learning_words_expression_language_idx
  on public.learning_words (expression, language);

create index if not exists learning_words_language_idx
  on public.learning_words (language, id);

create index if not exists learning_user_word_progress_user_reps_idx
  on public.learning_user_word_progress (user_id, reps, word_id);

create index if not exists learning_review_logs_user_datetime_idx
  on public.learning_review_logs (user_id, review_datetime desc);
