-- Add new status values to the candidate_assessment_status enum
ALTER TYPE candidate_assessment_status ADD VALUE IF NOT EXISTS 'invited';
ALTER TYPE candidate_assessment_status ADD VALUE IF NOT EXISTS 'hired';