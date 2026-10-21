-- Trial Day replaces the Live Call Trial (Elena + the owner, 21/22 Sep 2026).
--
-- The Enquire form screens applicants now, so the first real stage is a Trial
-- Day on live client campaigns, and the final interview with Marcus comes
-- AFTER it. LCT Booked and LCT Passed are retired; their keys stay valid so
-- the historic rows still read and the CHECK constraint is untouched.

-- 1. The Live Call Trial booking event becomes the Trial Day booking.
--    The slug is deliberately unchanged so no existing link breaks.
update public.booking_event_types
set name = 'Trial Day With Meridian',
    description = 'Kick-off for a trial day on live client campaigns. Tuesdays and Fridays.',
    duration_minutes = 30,
    location_type = 'google_meet'
where slug = 'live-call-trial-msp-k4n7p';

-- 2. Elena hosts it, not Marcus — she schedules and runs the trial days.
update public.booking_event_hosts h
set host_user_id = '916e451a-9e25-4e27-89ab-a5f3374d81ac',
    host_calendar_email = 'elena@meridiansales.example'
from public.booking_event_types e
where e.id = h.event_type_id and e.slug = 'live-call-trial-msp-k4n7p';

-- 3. Tuesdays and Fridays only, one 11:00 slot each.
--    weekday follows getUTCDay(): 0 = Sunday, 2 = Tuesday, 5 = Friday.
delete from public.booking_availability_rules r
using public.booking_event_types e
where e.id = r.event_type_id and e.slug = 'live-call-trial-msp-k4n7p';

insert into public.booking_availability_rules
  (event_type_id, host_user_id, weekday, start_time, end_time, timezone, min_notice_minutes, buffer_minutes)
select e.id, '916e451a-9e25-4e27-89ab-a5f3374d81ac', w, '11:00', '11:30', 'Europe/London', 120, 0
from public.booking_event_types e, (values (2), (5)) as t(w)
where e.slug = 'live-call-trial-msp-k4n7p';

-- 4. Move the people stranded by the retirement (the owner's rulings, 22 Sep).
--    The two in LCT Booked were booked for yesterday — back to screening so
--    Elena books them a trial day.
update public.candidates
set stage_key = 'screening'
where stage_key = 'booked';

--    The one in LCT Passed goes to the Trial Day on Friday 25 Sep, NOT to
--    the final interview.
update public.candidates
set stage_key = 'trial_day',
    trial_day_date = date '2026-09-25'
where stage_key = 'lct_passed';

select stage_key, count(*) from public.candidates group by 1 order by 2 desc;
