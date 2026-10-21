-- Normalize country data in clients table to standard 5-region list
UPDATE clients 
SET country = CASE 
  -- Handle multi-country combinations
  WHEN country ILIKE '%UK%' AND country ILIKE '%US%' AND country ILIKE '%Canada%' THEN 'United Kingdom, United States, Canada'
  WHEN country ILIKE '%UK%' AND country ILIKE '%EU%' AND country ILIKE '%US%' THEN 'United Kingdom, Europe, United States'
  WHEN country ILIKE '%UK%' AND (country ILIKE '%Germany%' OR country ILIKE '%EU%') THEN 'United Kingdom, Europe'
  WHEN country ILIKE '%UK%' AND country ILIKE '%US%' THEN 'United Kingdom, United States'
  WHEN country ILIKE '%US%' AND country ILIKE '%Canada%' THEN 'United States, Canada'
  WHEN country ILIKE '%US%' AND (country ILIKE '%EU%' OR country ILIKE '%Europe%') THEN 'United States, Europe'
  -- Handle single countries
  WHEN country ILIKE '%UK%' OR country = 'United Kingdom' THEN 'United Kingdom'
  WHEN country = 'US' OR country = 'USA' OR country ILIKE '%United States%' THEN 'United States'
  WHEN country ILIKE '%Canada%' THEN 'Canada'
  WHEN country ILIKE '%EU%' OR country ILIKE '%Europe%' OR country ILIKE '%Germany%' OR country ILIKE '%France%' OR country ILIKE '%Spain%' THEN 'Europe'
  WHEN country ILIKE '%Middle East%' OR country ILIKE '%UAE%' OR country ILIKE '%Dubai%' THEN 'Middle East'
  -- Keep existing if already standard
  WHEN country IN ('United States', 'United Kingdom', 'Canada', 'Europe', 'Middle East') THEN country
  ELSE country
END
WHERE country IS NOT NULL;

-- Sync normalized country data from clients to client_profiles
UPDATE client_profiles cp
SET country = c.country
FROM clients c
WHERE cp.id = c.id AND c.country IS NOT NULL;