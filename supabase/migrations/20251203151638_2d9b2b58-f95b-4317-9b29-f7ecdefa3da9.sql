
-- Fase 26c: ABCzorg Volledige Import
-- Stap 1: Nieuwe organisaties creëren

-- 1. Stichting Driestroom
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000030', 'Stichting Driestroom', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000030', 'Driestroom Hoofdlocatie', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 2. De Gezusters van den Berg
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000031', 'De Gezusters van den Berg', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000031', 'a1000000-0000-0000-0000-000000000031', 'Gezusters van den Berg Hoofdlocatie', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 3. Stichting de Hoeve
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000032', 'Stichting de Hoeve', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000032', 'a1000000-0000-0000-0000-000000000032', 'De Hoeve Hoofdlocatie', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 4. De Rooyse Wissel
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000033', 'De Rooyse Wissel', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000033', 'a1000000-0000-0000-0000-000000000033', 'Rooyse Wissel Hoofdlocatie', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 5. Stichting Mesazorg
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000034', 'Stichting Mesazorg', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000034', 'a1000000-0000-0000-0000-000000000034', 'Mesazorg Hoofdlocatie', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 6. Multiflexx B.V.
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000035', 'Multiflexx B.V.', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000035', 'a1000000-0000-0000-0000-000000000035', 'Multiflexx Hoofdlocatie', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 7. Rosales Zorg B.V.
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000036', 'Rosales Zorg B.V.', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000036', 'a1000000-0000-0000-0000-000000000036', 'Rosales Zorg Hoofdlocatie', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 8. Stichting Siza
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000037', 'Stichting Siza', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000037', 'a1000000-0000-0000-0000-000000000037', 'Siza Arnhem', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 9. Stichting ORO
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000038', 'Stichting ORO', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000038', 'a1000000-0000-0000-0000-000000000038', 'ORO Helmond', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 10. Stichting Kentalis Zorg (indien nog niet bestaat)
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000039', 'Stichting Kentalis Zorg', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 11. Tactus Verslavingszorg
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000040', 'Tactus Verslavingszorg', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000040', 'a1000000-0000-0000-0000-000000000040', 'Tactus Hoofdlocatie', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 12. Sherpa
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000041', 'Sherpa', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000041', 'a1000000-0000-0000-0000-000000000041', 'Sherpa Hoofdlocatie', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 13. ZorgSpectrum
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000042', 'ZorgSpectrum', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000042', 'a1000000-0000-0000-0000-000000000042', 'ZorgSpectrum Hoofdlocatie', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 14. Reinier van Arkel
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000043', 'Reinier van Arkel', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000043', 'a1000000-0000-0000-0000-000000000043', 'Reinier van Arkel Hoofdlocatie', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 15. Stichting Herenhuis Tiel
INSERT INTO client_organizations (id, name, org_id, created_at, updated_at)
VALUES ('a1000000-0000-0000-0000-000000000044', 'Stichting Herenhuis Tiel', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO client_locations (id, client_org_id, naam, is_active, created_at, updated_at)
VALUES ('b1000000-0000-0000-0000-000000000044', 'a1000000-0000-0000-0000-000000000044', 'Herenhuis Tiel Hoofdlocatie', true, NOW(), NOW())
ON CONFLICT DO NOTHING;
