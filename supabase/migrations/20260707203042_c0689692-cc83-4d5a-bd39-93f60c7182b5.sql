
UPDATE public.taxonomy_departments
SET active = false, updated_at = now()
WHERE name NOT IN ('Business Development','Tech Development','Marketing','Admin');

UPDATE public.taxonomy_departments
SET active = true, updated_at = now()
WHERE name IN ('Business Development','Tech Development','Marketing','Admin');

INSERT INTO public.taxonomy_departments (name, active, sort, domain_id)
SELECT v.name, true, v.sort, '16d68edd-be90-404b-a37a-9e1f3585a991'::uuid
FROM (VALUES
  ('Business Development', 10),
  ('Tech Development',     20),
  ('Marketing',            30),
  ('Admin',                40)
) AS v(name, sort)
WHERE NOT EXISTS (
  SELECT 1 FROM public.taxonomy_departments td WHERE td.name = v.name
);

UPDATE public.profiles SET department = 'Business Development' WHERE id IN (
  '58c14ca5-6594-417a-84c9-5a22f19d13b4',
  '4c5a7cb4-6987-49f1-a228-7629ef9cf0b4',
  '201fbafa-9de7-42d0-b5a1-7281c3671439',
  '79b55659-5666-4fd0-a620-02cb0afa2cea',
  '6017946a-6d9a-4944-ba09-f0cf5eb6b1e3',
  'cfbde100-dcbb-4751-a280-b83536d59137'
);

UPDATE public.profiles SET department = 'Tech Development' WHERE id IN (
  '54eab7a6-41d5-416d-8451-726ca0ead4b5',
  '09974ee0-f2c8-4cc1-81f1-0456832b3d44'
);

UPDATE public.profiles SET department = 'Marketing' WHERE id IN (
  'e0ce11c3-d6e2-4a37-8fc7-c822ab4912e4',
  '11111111-0000-0000-0000-000000000102',
  '38290b50-49a9-4af3-9f3f-a052497d63cb',
  '11111111-0000-0000-0000-000000000002',
  '365a1fb2-47a2-43ef-a9f7-9cbd1ea74131',
  'eebfd709-ada4-4ebb-865f-cfe040b1b3e4',
  'e9858984-b88f-4ec3-97f1-b531741a0e78',
  'f83d4464-e4ff-4100-a91c-d39b36348f08',
  'd211b1aa-2a91-43c8-bb31-da051e974094'
);

UPDATE public.profiles SET department = 'Admin'
WHERE id = '6dd230de-02bd-4bb1-af83-2b7c6ad451f0';

UPDATE public.profiles SET department = NULL WHERE id IN (
  '9869d739-4e1d-4904-a145-89ce230a708b',
  '15a70001-1c4d-4f71-a1b5-a9ffb7f50ea0'
);
