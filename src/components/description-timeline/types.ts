export interface DescriptionChangeEntry {
  id: string;
  action_text: string;
  created_at: string;
  created_by_name?: string;
  metadata?: {
    old_description?: string | null;
    new_description?: string | null;
    change_type?: 'added' | 'modified' | 'removed';
    old_length?: number;
    new_length?: number;
    changed_by_name?: string;
  };
}

export interface GroupedEntry {
  id: string;
  entries: DescriptionChangeEntry[];
  firstEntry: DescriptionChangeEntry;
  lastEntry: DescriptionChangeEntry;
  count: number;
  created_by_name: string;
  startTime: string;
  endTime: string;
  // Voor single entries
  isSingle: boolean;
}

export interface DescriptionTimelineProps {
  taskId: string;
  className?: string;
  onDescriptionRestore?: (description: string) => void;
  onCountChange?: (count: number) => void;
  onLatestChange?: (change: DescriptionChangeEntry | null) => void;
}
