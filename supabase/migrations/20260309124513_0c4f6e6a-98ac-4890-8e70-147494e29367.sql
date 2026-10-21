
-- Delete auth users for purged accounts (Claire Ferreira, Chad Moller, Ruan Norman)
DELETE FROM auth.users WHERE id IN (
  '23159492-624a-40d7-8ce7-3702bd718845',
  '405c1dc5-54a1-4320-8efa-e3a5bcfd73c4',
  'a18e5842-5d1f-4b8f-816a-c3782a80b4bc'
);
