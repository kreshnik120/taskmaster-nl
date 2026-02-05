-- ============================================================================
-- MIGRATIE: UNIFIED ACTIE SYSTEEM
-- Versie: 1.0.0
-- Doel: Audit trail voor taken + notificaties bij toewijzing
-- ============================================================================

-- STAP 1: Uitbreiden action_type constraint
ALTER TABLE public.task_action_history
DROP CONSTRAINT IF EXISTS task_action_history_action_type_check;

ALTER TABLE public.task_action_history
ADD CONSTRAINT task_action_history_action_type_check
CHECK (action_type IN (
  'followup',
  'note',
  'status_change',
  'description_change',
  'assignment_change',
  'attachment_added',
  'attachment_removed',
  'task_created'
));

-- STAP 2: Metadata kolom toevoegen
ALTER TABLE public.task_action_history
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- STAP 3: Trigger voor taak toewijzing notificatie + audit log
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_assigner_name TEXT;
  v_old_assignee_name TEXT;
  v_new_assignee_name TEXT;
BEGIN
  IF (OLD.assignee_id IS DISTINCT FROM NEW.assignee_id) THEN
    SELECT name INTO v_assigner_name FROM profiles WHERE id = auth.uid();
    SELECT name INTO v_old_assignee_name FROM profiles WHERE id = OLD.assignee_id;
    SELECT name INTO v_new_assignee_name FROM profiles WHERE id = NEW.assignee_id;

    IF NEW.assignee_id IS NOT NULL THEN
      INSERT INTO recruiter_notifications (
        org_id, user_id, notification_type, title, message, metadata, created_at
      ) VALUES (
        NEW.org_id,
        NEW.assignee_id,
        'task_assigned',
        'Taak toegewezen',
        format('%s heeft taak "%s" aan jou toegewezen',
               COALESCE(v_assigner_name, 'Iemand'), LEFT(NEW.title, 50)),
        jsonb_build_object(
          'task_id', NEW.id,
          'task_title', NEW.title,
          'assigned_by', auth.uid(),
          'assigned_by_name', v_assigner_name
        ),
        NOW()
      );
    END IF;

    INSERT INTO task_action_history (
      task_id, action_text, action_type, created_by, completed_at, completed_by, is_current, metadata
    ) VALUES (
      NEW.id,
      CASE
        WHEN OLD.assignee_id IS NULL AND NEW.assignee_id IS NOT NULL
          THEN format('Toegewezen aan %s', COALESCE(v_new_assignee_name, 'onbekend'))
        WHEN OLD.assignee_id IS NOT NULL AND NEW.assignee_id IS NULL
          THEN format('Toewijzing verwijderd (was: %s)', COALESCE(v_old_assignee_name, 'onbekend'))
        ELSE format('Hertoegewezen van %s naar %s',
                    COALESCE(v_old_assignee_name, 'onbekend'),
                    COALESCE(v_new_assignee_name, 'onbekend'))
      END,
      'assignment_change',
      auth.uid(), NOW(), auth.uid(), false,
      jsonb_build_object(
        'old_assignee_id', OLD.assignee_id,
        'old_assignee_name', v_old_assignee_name,
        'new_assignee_id', NEW.assignee_id,
        'new_assignee_name', v_new_assignee_name
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_task_assignment_change ON public.tasks;
CREATE TRIGGER on_task_assignment_change
  AFTER UPDATE OF assignee_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignment();

-- STAP 4: Trigger voor beschrijving wijziging audit log
CREATE OR REPLACE FUNCTION public.log_task_description_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_name TEXT;
BEGIN
  IF (OLD.description IS DISTINCT FROM NEW.description) THEN
    SELECT name INTO v_user_name FROM profiles WHERE id = auth.uid();

    INSERT INTO task_action_history (
      task_id, action_text, action_type, created_by, completed_at, completed_by, is_current, metadata
    ) VALUES (
      NEW.id,
      CASE
        WHEN OLD.description IS NULL OR OLD.description = '' THEN 'Beschrijving toegevoegd'
        WHEN NEW.description IS NULL OR NEW.description = '' THEN 'Beschrijving verwijderd'
        ELSE 'Beschrijving gewijzigd'
      END,
      'description_change',
      auth.uid(), NOW(), auth.uid(), false,
      jsonb_build_object(
        'old_length', COALESCE(LENGTH(OLD.description), 0),
        'new_length', COALESCE(LENGTH(NEW.description), 0),
        'changed_by_name', v_user_name
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS log_task_description_trigger ON public.tasks;
CREATE TRIGGER log_task_description_trigger
  AFTER UPDATE OF description ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_description_change();

-- STAP 5: Trigger voor bijlage toevoegen audit log
CREATE OR REPLACE FUNCTION public.log_attachment_added()
RETURNS TRIGGER AS $$
DECLARE
  v_user_name TEXT;
BEGIN
  SELECT name INTO v_user_name FROM profiles WHERE id = auth.uid();

  INSERT INTO task_action_history (
    task_id, action_text, action_type, created_by, completed_at, completed_by, is_current, metadata
  ) VALUES (
    NEW.task_id,
    format('Bijlage toegevoegd: %s', NEW.name),
    'attachment_added',
    auth.uid(), NOW(), auth.uid(), false,
    jsonb_build_object(
      'attachment_id', NEW.id,
      'attachment_name', NEW.name,
      'attachment_url', NEW.url,
      'file_size', NEW.file_size,
      'added_by_name', v_user_name
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS log_attachment_added_trigger ON public.attachments;
CREATE TRIGGER log_attachment_added_trigger
  AFTER INSERT ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.log_attachment_added();

-- STAP 6: Trigger voor bijlage verwijderen audit log
CREATE OR REPLACE FUNCTION public.log_attachment_removed()
RETURNS TRIGGER AS $$
DECLARE
  v_user_name TEXT;
BEGIN
  SELECT name INTO v_user_name FROM profiles WHERE id = auth.uid();

  INSERT INTO task_action_history (
    task_id, action_text, action_type, created_by, completed_at, completed_by, is_current, metadata
  ) VALUES (
    OLD.task_id,
    format('Bijlage verwijderd: %s', OLD.name),
    'attachment_removed',
    auth.uid(), NOW(), auth.uid(), false,
    jsonb_build_object(
      'attachment_id', OLD.id,
      'attachment_name', OLD.name,
      'removed_by_name', v_user_name
    )
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS log_attachment_removed_trigger ON public.attachments;
CREATE TRIGGER log_attachment_removed_trigger
  BEFORE DELETE ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.log_attachment_removed();

-- STAP 7: Trigger voor subtaak status wijziging (consistentie fix)
CREATE OR REPLACE FUNCTION public.log_subtask_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_name TEXT;
  v_assignee_name TEXT;
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT name INTO v_user_name FROM profiles WHERE id = auth.uid();
    SELECT name INTO v_assignee_name FROM profiles WHERE id = NEW.assignee_id;

    INSERT INTO task_action_history (
      task_id, action_text, action_type, created_by, completed_at, completed_by, is_current, metadata
    ) VALUES (
      NEW.task_id,
      CASE NEW.status
        WHEN 'completed' THEN format('Stap voltooid: %s', NEW.title)
        WHEN 'skipped' THEN format('Stap overgeslagen: %s', NEW.title)
        WHEN 'active' THEN format('Stap geactiveerd: %s', NEW.title)
        ELSE format('Stap status: %s → %s', OLD.status, NEW.status)
      END,
      'status_change',
      auth.uid(),
      CASE WHEN NEW.status IN ('completed', 'skipped') THEN NOW() ELSE NULL END,
      CASE WHEN NEW.status IN ('completed', 'skipped') THEN auth.uid() ELSE NULL END,
      false,
      jsonb_build_object(
        'subtask_id', NEW.id,
        'subtask_title', NEW.title,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'assignee_name', v_assignee_name,
        'changed_by_name', v_user_name
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS log_subtask_status_trigger ON public.subtasks;
CREATE TRIGGER log_subtask_status_trigger
  AFTER UPDATE OF status ON public.subtasks
  FOR EACH ROW EXECUTE FUNCTION public.log_subtask_status_change();

-- STAP 8: Indexes voor performance
CREATE INDEX IF NOT EXISTS idx_task_action_history_type ON public.task_action_history(task_id, action_type);
CREATE INDEX IF NOT EXISTS idx_task_action_history_created ON public.task_action_history(task_id, created_at DESC);