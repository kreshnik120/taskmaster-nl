
-- Add recurrence columns to tasks
ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN recurrence_assignee_id UUID DEFAULT NULL REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN recurrence_end_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN recurrence_parent_id UUID DEFAULT NULL REFERENCES tasks(id) ON DELETE SET NULL;

-- Check constraint
ALTER TABLE tasks ADD CONSTRAINT tasks_recurrence_rule_check
  CHECK (recurrence_rule IS NULL OR recurrence_rule IN ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'));

-- Trigger function for auto-creating next task on completion
CREATE OR REPLACE FUNCTION handle_recurring_task()
RETURNS TRIGGER AS $$
DECLARE
  v_next_due TIMESTAMPTZ;
  v_next_assignee UUID;
  v_next_start TIMESTAMPTZ;
BEGIN
  IF OLD.completed_at IS NOT NULL OR NEW.completed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.recurrence_rule IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.recurrence_end_at IS NOT NULL AND NOW() > NEW.recurrence_end_at THEN
    RETURN NEW;
  END IF;

  v_next_due := CASE NEW.recurrence_rule
    WHEN 'DAILY' THEN COALESCE(NEW.due_at, NOW()) + INTERVAL '1 day'
    WHEN 'WEEKLY' THEN COALESCE(NEW.due_at, NOW()) + INTERVAL '7 days'
    WHEN 'BIWEEKLY' THEN COALESCE(NEW.due_at, NOW()) + INTERVAL '14 days'
    WHEN 'MONTHLY' THEN COALESCE(NEW.due_at, NOW()) + INTERVAL '1 month'
  END;

  IF NEW.start_at IS NOT NULL AND NEW.due_at IS NOT NULL THEN
    v_next_start := v_next_due - (NEW.due_at - NEW.start_at);
  END IF;

  v_next_assignee := COALESCE(NEW.recurrence_assignee_id, NEW.assignee_id);

  INSERT INTO tasks (
    title, description, priority, assignee_id, reporter_id,
    org_id, column_id, due_at, start_at, category,
    recurrence_rule, recurrence_assignee_id, recurrence_end_at, recurrence_parent_id,
    is_all_day, order_key
  ) VALUES (
    NEW.title, NEW.description, NEW.priority, v_next_assignee, NEW.reporter_id,
    NEW.org_id, NEW.column_id, v_next_due, v_next_start, NEW.category,
    NEW.recurrence_rule, NEW.recurrence_assignee_id, NEW.recurrence_end_at,
    COALESCE(NEW.recurrence_parent_id, NEW.id),
    NEW.is_all_day, 'A0'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_recurring_task_completed
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION handle_recurring_task();
