
-- Create campaign_weekly_goals table
CREATE TABLE public.campaign_weekly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  week_number INT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  target INT NOT NULL DEFAULT 1,
  achieved INT NOT NULL DEFAULT 0,
  goal_met BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, week_number)
);

ALTER TABLE campaign_weekly_goals ENABLE ROW LEVEL SECURITY;

-- Clients can view own goals
CREATE POLICY "Clients can view own goals" ON campaign_weekly_goals
  FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT client_profile_id FROM client_profile_users WHERE user_id = auth.uid()
    ) OR client_id IN (
      SELECT id FROM client_profiles WHERE user_id = auth.uid()
    )
  );

-- Admin roles can view all goals
CREATE POLICY "Admin roles can view all goals" ON campaign_weekly_goals
  FOR SELECT TO authenticated
  USING (is_admin_role(auth.uid()));

-- Admin roles can manage goals
CREATE POLICY "Admin roles can manage goals" ON campaign_weekly_goals
  FOR ALL TO authenticated
  USING (is_admin_role(auth.uid()));

-- Function to auto-generate weekly goals when campaign dates are set
CREATE OR REPLACE FUNCTION public.generate_campaign_weekly_goals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_weeks INT;
  v_phase1_weeks INT;
  v_week_start DATE;
  i INT;
BEGIN
  -- Only generate when start_date is set/changed and we have both dates
  IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL 
     AND (OLD.start_date IS DISTINCT FROM NEW.start_date OR OLD.end_date IS DISTINCT FROM NEW.end_date) THEN
    
    -- Delete existing goals for this campaign (regenerate)
    DELETE FROM campaign_weekly_goals WHERE campaign_id = NEW.id;
    
    -- Calculate total weeks
    v_total_weeks := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (NEW.end_date::timestamp - NEW.start_date::timestamp)) / (7 * 86400)));
    v_total_weeks := LEAST(v_total_weeks, 52); -- cap at 52 weeks
    
    -- Phase 1 is ~66% of total weeks (rounds to nearest), min 1
    v_phase1_weeks := GREATEST(1, ROUND(v_total_weeks * 0.66));
    
    FOR i IN 1..v_total_weeks LOOP
      v_week_start := NEW.start_date::date + ((i - 1) * 7);
      
      INSERT INTO campaign_weekly_goals (
        campaign_id, client_id, week_number, week_start, week_end, target
      ) VALUES (
        NEW.id,
        NEW.client_id,
        i,
        v_week_start,
        v_week_start + 6,
        CASE WHEN i <= v_phase1_weeks THEN 1 ELSE 2 END
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_campaign_weekly_goals
  AFTER INSERT OR UPDATE OF start_date, end_date ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION generate_campaign_weekly_goals();

-- Function to update achieved count when meeting status changes to/from sat
CREATE OR REPLACE FUNCTION public.update_campaign_weekly_goal_on_sat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_campaign_id UUID;
  v_meeting_date DATE;
  v_goal_id UUID;
BEGIN
  -- Determine the campaign_id and meeting_date
  v_campaign_id := COALESCE(NEW.campaign_id, OLD.campaign_id);
  v_meeting_date := COALESCE(NEW.meeting_date, OLD.meeting_date)::date;
  
  IF v_campaign_id IS NULL OR v_meeting_date IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Only count qualified meetings (video_conference, mobile_phone_call, terms_sent)
  IF COALESCE(NEW.lead_type, OLD.lead_type) NOT IN ('video_conference', 'mobile_phone_call', 'terms_sent') THEN
    RETURN NEW;
  END IF;
  
  -- Skip rebooks
  IF COALESCE(NEW.is_rebook, false) THEN
    RETURN NEW;
  END IF;
  
  -- Find the matching goal week
  SELECT id INTO v_goal_id
  FROM campaign_weekly_goals
  WHERE campaign_id = v_campaign_id
    AND v_meeting_date BETWEEN week_start AND week_end
  LIMIT 1;
  
  IF v_goal_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- INCREMENT: attendance_status changed TO 'sat'
  IF NEW.attendance_status = 'sat' AND (OLD.attendance_status IS NULL OR OLD.attendance_status != 'sat') THEN
    UPDATE campaign_weekly_goals
    SET achieved = achieved + 1,
        goal_met = (achieved + 1) >= target,
        updated_at = now()
    WHERE id = v_goal_id;
  END IF;
  
  -- DECREMENT: attendance_status changed FROM 'sat'
  IF OLD.attendance_status = 'sat' AND NEW.attendance_status != 'sat' THEN
    UPDATE campaign_weekly_goals
    SET achieved = GREATEST(0, achieved - 1),
        goal_met = (GREATEST(0, achieved - 1)) >= target,
        updated_at = now()
    WHERE id = v_goal_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_campaign_weekly_goal_on_sat
  AFTER UPDATE OF attendance_status ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_weekly_goal_on_sat();
