-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enums
CREATE TYPE user_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'GUEST');
CREATE TYPE task_status AS ENUM ('BACKLOG', 'READY', 'DOING', 'BLOCKED', 'REVIEW', 'DONE');
CREATE TYPE priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE dependency_type AS ENUM ('BLOCKS', 'RELATES', 'DUPLICATE');
CREATE TYPE reminder_channel AS ENUM ('IN_APP', 'EMAIL');

-- Create organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Create profiles table (linked to auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create user_organizations junction table
CREATE TABLE user_organizations (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'MEMBER',
  PRIMARY KEY (user_id, org_id)
);

ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;

-- Create projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create columns table
CREATE TABLE columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status task_status NOT NULL,
  wip_limit INTEGER,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE columns ENABLE ROW LEVEL SECURITY;

-- Create tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  column_id UUID REFERENCES columns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  priority priority NOT NULL DEFAULT 'MEDIUM',
  start_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  estimate_min INTEGER,
  next_action TEXT,
  completed_at TIMESTAMPTZ,
  is_all_day BOOLEAN NOT NULL DEFAULT false,
  order_key TEXT NOT NULL DEFAULT 'A0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Create indexes for tasks
CREATE INDEX idx_tasks_org_project_column ON tasks(org_id, project_id, column_id);
CREATE INDEX idx_tasks_assignee_due ON tasks(assignee_id, due_at);
CREATE INDEX idx_tasks_order_key ON tasks(order_key);

-- Create subtasks table
CREATE TABLE subtasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

-- Create comments table
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Create attachments table
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- Create tags table
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- Create tags_on_tasks junction table
CREATE TABLE tags_on_tasks (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

ALTER TABLE tags_on_tasks ENABLE ROW LEVEL SECURITY;

-- Create dependencies table
CREATE TABLE dependencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  to_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type dependency_type NOT NULL DEFAULT 'BLOCKS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dependencies ENABLE ROW LEVEL SECURITY;

-- Create reminders table
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL,
  channel reminder_channel NOT NULL DEFAULT 'IN_APP',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Create time_entries table
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start TIMESTAMPTZ NOT NULL,
  "end" TIMESTAMPTZ,
  duration_min INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_time_entries ON time_entries(task_id, user_id, start);

-- Create watches table
CREATE TABLE watches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, task_id)
);

ALTER TABLE watches ENABLE ROW LEVEL SECURITY;

-- Create share_links table
CREATE TABLE share_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  can_comment BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, image)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for tasks updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for organizations
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = organizations.id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (true);

-- RLS Policies for user_organizations
CREATE POLICY "Users can view their org memberships"
  ON user_organizations FOR SELECT
  USING (user_id = auth.uid() OR org_id IN (
    SELECT org_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create org memberships"
  ON user_organizations FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS Policies for projects
CREATE POLICY "Users can view projects in their orgs"
  ON projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = projects.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create projects in their orgs"
  ON projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = projects.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update projects in their orgs"
  ON projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = projects.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

-- RLS Policies for columns
CREATE POLICY "Users can view columns in their projects"
  ON columns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      JOIN user_organizations ON user_organizations.org_id = projects.org_id
      WHERE projects.id = columns.project_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage columns in their projects"
  ON columns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects
      JOIN user_organizations ON user_organizations.org_id = projects.org_id
      WHERE projects.id = columns.project_id
      AND user_organizations.user_id = auth.uid()
    )
  );

-- RLS Policies for tasks
CREATE POLICY "Users can view tasks in their orgs"
  ON tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = tasks.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tasks in their orgs"
  ON tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = tasks.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update tasks in their orgs"
  ON tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = tasks.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tasks in their orgs"
  ON tasks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = tasks.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

-- RLS Policies for subtasks, comments, attachments (inherit from tasks)
CREATE POLICY "Users can view subtasks"
  ON subtasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      JOIN user_organizations ON user_organizations.org_id = tasks.org_id
      WHERE tasks.id = subtasks.task_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage subtasks"
  ON subtasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      JOIN user_organizations ON user_organizations.org_id = tasks.org_id
      WHERE tasks.id = subtasks.task_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view comments"
  ON comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      JOIN user_organizations ON user_organizations.org_id = tasks.org_id
      WHERE tasks.id = comments.task_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create comments"
  ON comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM tasks
      JOIN user_organizations ON user_organizations.org_id = tasks.org_id
      WHERE tasks.id = comments.task_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view attachments"
  ON attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      JOIN user_organizations ON user_organizations.org_id = tasks.org_id
      WHERE tasks.id = attachments.task_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage attachments"
  ON attachments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      JOIN user_organizations ON user_organizations.org_id = tasks.org_id
      WHERE tasks.id = attachments.task_id
      AND user_organizations.user_id = auth.uid()
    )
  );

-- RLS Policies for tags
CREATE POLICY "Users can view all tags"
  ON tags FOR SELECT
  USING (true);

CREATE POLICY "Users can create tags"
  ON tags FOR INSERT
  WITH CHECK (true);

-- RLS Policies for tags_on_tasks
CREATE POLICY "Users can view tags on tasks"
  ON tags_on_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      JOIN user_organizations ON user_organizations.org_id = tasks.org_id
      WHERE tasks.id = tags_on_tasks.task_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage tags on tasks"
  ON tags_on_tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      JOIN user_organizations ON user_organizations.org_id = tasks.org_id
      WHERE tasks.id = tags_on_tasks.task_id
      AND user_organizations.user_id = auth.uid()
    )
  );

-- RLS Policies for time_entries
CREATE POLICY "Users can view their time entries"
  ON time_entries FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their time entries"
  ON time_entries FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their time entries"
  ON time_entries FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policies for dependencies, reminders, watches
CREATE POLICY "Users can view dependencies"
  ON dependencies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      JOIN user_organizations ON user_organizations.org_id = tasks.org_id
      WHERE tasks.id = dependencies.from_task_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage dependencies"
  ON dependencies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      JOIN user_organizations ON user_organizations.org_id = tasks.org_id
      WHERE tasks.id = dependencies.from_task_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view reminders"
  ON reminders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      JOIN user_organizations ON user_organizations.org_id = tasks.org_id
      WHERE tasks.id = reminders.task_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage reminders"
  ON reminders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      JOIN user_organizations ON user_organizations.org_id = tasks.org_id
      WHERE tasks.id = reminders.task_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their watches"
  ON watches FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their watches"
  ON watches FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their watches"
  ON watches FOR DELETE
  USING (user_id = auth.uid());