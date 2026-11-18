-- The person's usual week: office / home / off per day, office hours and commute.
-- Shape: {"days": ["office", …7 entries, Monday first], "leaveAt": "08:00", "commuteMin": 45, "start": "09:00", "end": "18:00"}
alter table public.profiles add column if not exists work_plan jsonb;
