-- Storage bucket voor taak bijlagen
INSERT INTO storage.buckets (id, name, public) 
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies voor de bucket
CREATE POLICY "Authenticated users can upload task attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-attachments');

CREATE POLICY "Users can view task attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-attachments');

CREATE POLICY "Users can delete task attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-attachments');

CREATE POLICY "Users can update task attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'task-attachments');