-- Koppel erik@abczorg.nl aan ABCzorg en CitoZorg organisaties
INSERT INTO public.user_organizations (user_id, org_id, role)
VALUES 
  ('7fdc4755-d9e8-4468-b1ad-16fa80270aab', '550e8400-e29b-41d4-a716-446655440000', 'ADMIN'),
  ('7fdc4755-d9e8-4468-b1ad-16fa80270aab', '650e8400-e29b-41d4-a716-446655440001', 'ADMIN')
ON CONFLICT (user_id, org_id) DO NOTHING;

-- Voeg admin role toe in user_roles tabel
INSERT INTO public.user_roles (user_id, role)
VALUES ('7fdc4755-d9e8-4468-b1ad-16fa80270aab', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;