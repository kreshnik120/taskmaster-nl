-- =====================================================
-- WHATSAPP CONTACTS DATA QUALITY CLEANUP
-- Merge duplicates and add preventive constraint
-- =====================================================

-- STEP 1: MERGE DUPLICATES
-- Strategy: Keep the contact WITH profile picture, transfer chats, delete duplicate

-- 1. 31613576869 - Keep: 0d0efaa2 (has photo), Delete: 6122b9b1 (has chat)
UPDATE whatsapp_chats 
SET contact_id = '0d0efaa2-be32-4c00-86eb-c17e5e2ba113'
WHERE contact_id = '6122b9b1-7b10-46fa-a34c-ab4fbf2f782a';

DELETE FROM whatsapp_contacts WHERE id = '6122b9b1-7b10-46fa-a34c-ab4fbf2f782a';

-- 2. 31614464245 - Keep: aa3ae834 (has photo), Delete: b34339f2 (has chat)
UPDATE whatsapp_chats 
SET contact_id = 'aa3ae834-4f54-4024-ad4d-7d00c5cb5b4c'
WHERE contact_id = 'b34339f2-8fa9-45c0-addf-51a54341247f';

DELETE FROM whatsapp_contacts WHERE id = 'b34339f2-8fa9-45c0-addf-51a54341247f';

-- 3. 31616202241 (Ismail) - Keep: c6a6d4a9 (has photo + chat), Delete: 1a27f02f
DELETE FROM whatsapp_contacts WHERE id = '1a27f02f-b62a-4790-b981-21ad77291965';

-- 4. 31616583528 - Keep: d9c09524 (has photo + chat), Delete: 638d9ed1
DELETE FROM whatsapp_contacts WHERE id = '638d9ed1-1049-49b9-8d07-f065cb927635';

-- 5. 31618710360 - Keep: 5ddf8277 (has photo), Delete: b990ccef (has chat)
UPDATE whatsapp_chats 
SET contact_id = '5ddf8277-9f07-4e83-8641-b51232fb9941'
WHERE contact_id = 'b990ccef-e08b-4f1b-8dc3-9a9f45550ce3';

DELETE FROM whatsapp_contacts WHERE id = 'b990ccef-e08b-4f1b-8dc3-9a9f45550ce3';

-- 6. 31619944105 (Diosa Care) - Keep: 0a806068 (has photo + chat), Delete: ecb41adf
DELETE FROM whatsapp_contacts WHERE id = 'ecb41adf-e356-4044-91b9-e2e6cfb4cacb';

-- 7. 31625196965 (Jones) - Keep: 40c51c56 (has photo), Delete: 99ff7977 (has chat)
UPDATE whatsapp_chats 
SET contact_id = '40c51c56-df8c-4a97-8096-789914a1f13a'
WHERE contact_id = '99ff7977-8edc-4532-95a3-6dffa4a8afe7';

UPDATE whatsapp_contacts 
SET display_name = 'Jones'
WHERE id = '40c51c56-df8c-4a97-8096-789914a1f13a';

DELETE FROM whatsapp_contacts WHERE id = '99ff7977-8edc-4532-95a3-6dffa4a8afe7';

-- 8. 31642520970 (Vigiilent) - Keep: 813a7f37 (has photo), Delete: f9c079e1 (has chat)
UPDATE whatsapp_chats 
SET contact_id = '813a7f37-87e2-4f0a-8a28-d4ba3ad24e63'
WHERE contact_id = 'f9c079e1-2723-4f27-aa19-982c9fc10300';

DELETE FROM whatsapp_contacts WHERE id = 'f9c079e1-2723-4f27-aa19-982c9fc10300';

-- 9. 31643056553 (Leonie) - Keep: b24fc812 (has photo + chat), Delete: 3a45b573
DELETE FROM whatsapp_contacts WHERE id = '3a45b573-ee79-4eb5-8612-468fad0ee0b0';

-- 10. 31648005001 (Kreshnik) - 3 records, keep: 9f68dd01 (has photo + chat)
UPDATE whatsapp_chats 
SET contact_id = '9f68dd01-0bfc-4eb4-bd0e-cdd5b79eae03'
WHERE contact_id IN ('916882a1-8440-4388-9ece-c22ea74046ae', '890dddcd-5b20-4752-ae23-e21198e30429');

UPDATE whatsapp_contacts 
SET phone_number = '31648005001'
WHERE id = '9f68dd01-0bfc-4eb4-bd0e-cdd5b79eae03';

DELETE FROM whatsapp_contacts 
WHERE id IN ('916882a1-8440-4388-9ece-c22ea74046ae', '890dddcd-5b20-4752-ae23-e21198e30429');

-- 11. 31686861816 (BLOEZEM) - Keep: 43b156aa (has photo), Delete: af1e3d90 (has chat)
UPDATE whatsapp_chats 
SET contact_id = '43b156aa-4439-4600-9014-b67e9869c7ef'
WHERE contact_id = 'af1e3d90-fc42-4355-9f6b-4ad21a7ac107';

UPDATE whatsapp_contacts 
SET display_name = 'BLOEZEM'
WHERE id = '43b156aa-4439-4600-9014-b67e9869c7ef';

DELETE FROM whatsapp_contacts WHERE id = 'af1e3d90-fc42-4355-9f6b-4ad21a7ac107';

-- STEP 2: NORMALIZE ALL REMAINING PHONE NUMBERS
-- Update any remaining contacts with non-normalized formats
UPDATE whatsapp_contacts
SET phone_number = REGEXP_REPLACE(SPLIT_PART(phone_number, '@', 1), '[^0-9]', '', 'g')
WHERE phone_number NOT LIKE 'group-%'
  AND (phone_number LIKE '+%' OR phone_number LIKE '%@%');

-- STEP 3: ADD PREVENTIVE UNIQUE INDEX
-- This prevents future duplicates at the database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_org_normalized_phone 
ON whatsapp_contacts (
  org_id, 
  REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g')
) 
WHERE phone_number NOT LIKE 'group-%';