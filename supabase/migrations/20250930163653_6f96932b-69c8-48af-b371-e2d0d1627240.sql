-- Add RLS policies for share_links table

-- Allow anyone to view share_links (they are meant to be shared publicly)
CREATE POLICY "Anyone can view share links"
ON public.share_links
FOR SELECT
USING (true);

-- Users can create share links for tasks/projects in their organizations
CREATE POLICY "Users can create share links for their org tasks"
ON public.share_links
FOR INSERT
WITH CHECK (
  (task_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM tasks
    JOIN user_organizations ON user_organizations.org_id = tasks.org_id
    WHERE tasks.id = share_links.task_id
      AND user_organizations.user_id = auth.uid()
  ))
  OR
  (project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM projects
    JOIN user_organizations ON user_organizations.org_id = projects.org_id
    WHERE projects.id = share_links.project_id
      AND user_organizations.user_id = auth.uid()
  ))
);

-- Users can delete share links for tasks/projects in their organizations
CREATE POLICY "Users can delete share links for their org tasks"
ON public.share_links
FOR DELETE
USING (
  (task_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM tasks
    JOIN user_organizations ON user_organizations.org_id = tasks.org_id
    WHERE tasks.id = share_links.task_id
      AND user_organizations.user_id = auth.uid()
  ))
  OR
  (project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM projects
    JOIN user_organizations ON user_organizations.org_id = projects.org_id
    WHERE projects.id = share_links.project_id
      AND user_organizations.user_id = auth.uid()
  ))
);

-- Users can update share links for tasks/projects in their organizations
CREATE POLICY "Users can update share links for their org tasks"
ON public.share_links
FOR UPDATE
USING (
  (task_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM tasks
    JOIN user_organizations ON user_organizations.org_id = tasks.org_id
    WHERE tasks.id = share_links.task_id
      AND user_organizations.user_id = auth.uid()
  ))
  OR
  (project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM projects
    JOIN user_organizations ON user_organizations.org_id = projects.org_id
    WHERE projects.id = share_links.project_id
      AND user_organizations.user_id = auth.uid()
  ))
);