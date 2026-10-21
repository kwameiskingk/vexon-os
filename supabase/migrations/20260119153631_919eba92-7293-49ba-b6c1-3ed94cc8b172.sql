-- Create trigger function to notify users when they earn an achievement
CREATE OR REPLACE FUNCTION public.notify_achievement_earned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_user_role app_role;
  v_achievement_name TEXT;
  v_achievement_description TEXT;
BEGIN
  -- Get the user_id from setters_profiles or profiles based on email
  SELECT sp.user_id INTO v_user_id
  FROM setters_profiles sp
  WHERE sp.email = NEW.email;
  
  -- If not found in setters_profiles, try profiles
  IF v_user_id IS NULL THEN
    SELECT p.id INTO v_user_id
    FROM profiles p
    WHERE p.email = NEW.email;
  END IF;
  
  -- Get user's role
  SELECT role INTO v_user_role
  FROM user_roles
  WHERE user_id = v_user_id
  LIMIT 1;
  
  -- Get achievement details from definition if available
  IF NEW.achievement_definition_id IS NOT NULL THEN
    SELECT name, description INTO v_achievement_name, v_achievement_description
    FROM achievement_definitions
    WHERE id = NEW.achievement_definition_id;
  ELSE
    -- Use achievement_key as fallback
    v_achievement_name := REPLACE(INITCAP(REPLACE(NEW.achievement_key, '_', ' ')), '_', ' ');
    v_achievement_description := 'You have earned a new achievement!';
  END IF;
  
  -- Send notification to the user who earned the achievement
  IF v_user_id IS NOT NULL AND v_user_role IS NOT NULL THEN
    INSERT INTO notifications (
      recipient_id,
      recipient_role,
      title,
      message,
      category,
      link_url
    )
    VALUES (
      v_user_id,
      v_user_role,
      '🏆 Achievement Unlocked!',
      'Congratulations! You earned: ' || COALESCE(v_achievement_name, NEW.achievement_key),
      'achievement',
      CASE 
        WHEN v_user_role = 'setter' THEN '/setter/achievements'
        WHEN v_user_role = 'account_executive' THEN '/ae/achievements'
        WHEN v_user_role = 'csm' THEN '/csm/achievements'
        ELSE '/admin/operations/achievements'
      END
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS on_achievement_earned ON leaderboard_achievements;
CREATE TRIGGER on_achievement_earned
  AFTER INSERT ON leaderboard_achievements
  FOR EACH ROW
  EXECUTE FUNCTION notify_achievement_earned();

-- Also add trigger to notify when bonus challenges are created (notify all setters)
CREATE OR REPLACE FUNCTION public.notify_bonus_challenge_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Notify all active setters about new bonus challenge
  INSERT INTO notifications (
    recipient_id,
    recipient_role,
    title,
    message,
    category,
    link_url
  )
  SELECT 
    sp.user_id,
    'setter',
    '💰 New Bonus Challenge!',
    NEW.title || ': ' || NEW.description || ' (' || NEW.amount || ')',
    'system',
    '/setter/leaderboard'
  FROM setters_profiles sp
  WHERE sp.active = true AND sp.user_id IS NOT NULL;
  
  RETURN NEW;
END;
$$;

-- Create the trigger for bonus challenges
DROP TRIGGER IF EXISTS on_bonus_challenge_created ON leaderboard_bonuses;
CREATE TRIGGER on_bonus_challenge_created
  AFTER INSERT ON leaderboard_bonuses
  FOR EACH ROW
  WHEN (NEW.active = true)
  EXECUTE FUNCTION notify_bonus_challenge_created();

-- Add trigger for leaderboard awards (daily/weekly/monthly winners)
CREATE OR REPLACE FUNCTION public.notify_leaderboard_award()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_user_role app_role;
  v_award_label TEXT;
BEGIN
  -- Get user_id from setters_profiles
  SELECT sp.user_id INTO v_user_id
  FROM setters_profiles sp
  WHERE sp.email = NEW.email;
  
  -- Get user's role
  SELECT role INTO v_user_role
  FROM user_roles
  WHERE user_id = v_user_id
  LIMIT 1;
  
  -- Format award label
  v_award_label := INITCAP(REPLACE(NEW.type, '_', ' '));
  
  -- Send notification
  IF v_user_id IS NOT NULL AND v_user_role IS NOT NULL THEN
    INSERT INTO notifications (
      recipient_id,
      recipient_role,
      title,
      message,
      category,
      link_url
    )
    VALUES (
      v_user_id,
      v_user_role,
      '🎉 You''re a Winner!',
      'Congratulations! You''ve been named ' || v_award_label || ' for ' || TO_CHAR(NEW.date, 'Mon DD, YYYY') || '!',
      'achievement',
      CASE 
        WHEN v_user_role = 'setter' THEN '/setter/leaderboard'
        ELSE '/admin/operations/leaderboard'
      END
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger for leaderboard awards
DROP TRIGGER IF EXISTS on_leaderboard_award ON leaderboard_awards;
CREATE TRIGGER on_leaderboard_award
  AFTER INSERT ON leaderboard_awards
  FOR EACH ROW
  EXECUTE FUNCTION notify_leaderboard_award();