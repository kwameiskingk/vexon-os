-- 12 Oct 2026 (SDR streamline PR 1): the seeded hourly-update task names carry an
-- em dash ("Hourly Update — 10 AM"). House style has no em dashes, so the
-- template rows and every instance already materialised from them are renamed
-- to "Hourly Update, 10 AM". materialize_task_instances() copies tasks.title
-- into task_instances.title, so future instances pick the new name up
-- automatically. Safe to run twice: the WHERE clauses match nothing afterwards.

UPDATE public.tasks
SET title = replace(title, 'Hourly Update — ', 'Hourly Update, ')
WHERE title LIKE 'Hourly Update — %';

UPDATE public.task_instances
SET title = replace(title, 'Hourly Update — ', 'Hourly Update, ')
WHERE title LIKE 'Hourly Update — %';
