import type { TaskListTask } from '../types';

/**
 * Announces a message to screen readers via a live region
 * Creates a temporary element with aria-live="polite"
 */
export function announceToScreenReader(message: string): void {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  // Remove after announcement is made
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * Generates a descriptive ARIA label for a task
 */
export function generateTaskAriaLabel(task: TaskListTask): string {
  const parts: string[] = [task.title];
  
  if (task.priority) {
    const priorityLabels: Record<string, string> = {
      CRITICAL: 'Kritiek',
      HIGH: 'Hoog',
      MEDIUM: 'Gemiddeld',
      LOW: 'Laag',
    };
    parts.push(`prioriteit ${priorityLabels[task.priority] || task.priority}`);
  }
  
  if (task.due_at) {
    const dueDate = new Date(task.due_at);
    const isOverdue = dueDate < new Date();
    const formattedDate = dueDate.toLocaleDateString('nl-NL');
    parts.push(isOverdue ? `verlopen op ${formattedDate}` : `deadline ${formattedDate}`);
  }
  
  if (task.profiles?.name) {
    parts.push(`toegewezen aan ${task.profiles.name}`);
  }
  
  return parts.join(', ');
}

/**
 * Focuses the first interactive element within a container
 */
export function focusFirstInteractive(container: HTMLElement): void {
  const focusableSelector = 
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  
  const firstFocusable = container.querySelector<HTMLElement>(focusableSelector);
  if (firstFocusable) {
    firstFocusable.focus();
  }
}

/**
 * Creates a skip link target ID for the task list
 */
export const TASK_LIST_ID = 'task-list-main';
