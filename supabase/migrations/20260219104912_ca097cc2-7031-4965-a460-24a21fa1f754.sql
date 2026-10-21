
-- Add columns for bonus challenge tracking & winner flow
ALTER TABLE public.leaderboard_bonuses 
ADD COLUMN IF NOT EXISTS tracking_source text NOT NULL DEFAULT 'app',
ADD COLUMN IF NOT EXISTS meeting_goal integer,
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS winner_email text,
ADD COLUMN IF NOT EXISTS winner_approved_by uuid,
ADD COLUMN IF NOT EXISTS winner_approved_at timestamptz;

-- Trigger: when challenge status changes to 'completed' and winner is set, notify the winner
CREATE OR REPLACE FUNCTION public.notify_bonus_challenge_winner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_user_role app_role;
BEGIN
  -- Notify admins when status changes to pending_approval
  IF NEW.status = 'pending_approval' AND (OLD.status IS DISTINCT FROM 'pending_approval') THEN
    INSERT INTO notifications (recipient_role, title, message, category, link_url)
    VALUES (
      'admin',
      '🏆 Bonus Challenge Ended - Approve Winner',
      'The bonus challenge "' || NEW.title || '" has ended. Please review and approve the winner.',
      'system',
      '/admin/operations/leaderboard'
    );
  END IF;

  -- Notify winner when approved
  IF NEW.status = 'completed' AND OLD.status = 'pending_approval' AND NEW.winner_email IS NOT NULL THEN
    -- Find the winner's user_id
    SELECT sp.user_id INTO v_user_id
    FROM setters_profiles sp
    WHERE LOWER(sp.email) = LOWER(NEW.winner_email);
    
    IF v_user_id IS NULL THEN
      SELECT p.id INTO v_user_id
      FROM profiles p
      WHERE LOWER(p.email) = LOWER(NEW.winner_email);
    END IF;
    
    -- Get role
    SELECT role INTO v_user_role
    FROM user_roles
    WHERE user_id = v_user_id
    LIMIT 1;
    
    IF v_user_id IS NOT NULL AND v_user_role IS NOT NULL THEN
      INSERT INTO notifications (recipient_id, recipient_role, title, message, category, link_url)
      VALUES (
        v_user_id,
        v_user_role,
        '🎉 You Won a Bonus Challenge!',
        'Congratulations! You won the "' || NEW.title || '" challenge! Reward: ' || NEW.amount,
        'achievement',
        CASE 
          WHEN v_user_role = 'setter' THEN '/setter/leaderboard'
          ELSE '/admin/operations/leaderboard'
        END
      );
    END IF;
    
    -- Also notify all admins about the approved winner
    INSERT INTO notifications (recipient_role, title, message, category, link_url)
    VALUES (
      'admin',
      '🏆 Bonus Challenge Winner Approved',
      NEW.winner_email || ' has been approved as the winner of "' || NEW.title || '"!',
      'system',
      '/admin/operations/leaderboard'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_bonus_challenge_winner
AFTER UPDATE ON public.leaderboard_bonuses
FOR EACH ROW
EXECUTE FUNCTION public.notify_bonus_challenge_winner();
