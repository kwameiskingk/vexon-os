create or replace function public.notify_csm_meeting_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  -- Only trigger when client_accepted changes to true
  if new.client_accepted = true and (old.client_accepted is null or old.client_accepted = false) then
    insert into public.notifications (
      recipient_role,
      title,
      message,
      category,
      link_url,
      triggered_by
    )
    values (
      'csm',
      'Meeting Accepted by Client',
      'Client ' || coalesce(
        (select cp.company_name from public.client_profiles cp where cp.id = new.client_profile_id),
        new.company_name
      ) || ' has accepted their meeting scheduled for ' || to_char(new.meeting_date::date, 'Mon DD, YYYY') || ' at ' || new.meeting_time,
      'meeting',
      '/csm/dashboard',
      new.client_user_id
    );
  end if;

  return new;
end;
$function$;