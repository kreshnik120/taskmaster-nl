import { Search, ArrowUpDown, Calendar, AlertTriangle, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useState, useEffect } from 'react';
import type { TaskListFilters } from './types';

interface TaskListToolbarProps {
  filters: TaskListFilters;
  onChange: (filters: TaskListFilters) => void;
  taskCount: number;
  totalCount: number;
}

const SORT_OPTIONS = [
  { value: 'due_at', label: 'Deadline', icon: Calendar },
  { value: 'priority', label: 'Prioriteit', icon: AlertTriangle },
  { value: 'created_at', label: 'Startdatum', icon: Clock },
] as const;

/**
 * Toolbar component with search and sort controls
 */
export function TaskListToolbar({
  filters,
  onChange,
  taskCount,
  totalCount
}: TaskListToolbarProps) {
  const [searchInput, setSearchInput] = useState(filters.searchQuery);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  // Sync debounced search to filters
  useEffect(() => {
    if (debouncedSearch !== filters.searchQuery) {
      onChange({ ...filters, searchQuery: debouncedSearch });
    }
  }, [debouncedSearch, filters, onChange]);

  const currentSortOption = SORT_OPTIONS.find(opt => opt.value === filters.sortBy) || SORT_OPTIONS[0];

  const handleSortChange = (sortBy: TaskListFilters['sortBy']) => {
    onChange({ ...filters, sortBy });
  };

  const toggleSortDirection = () => {
    onChange({
      ...filters,
      sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc'
    });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-4">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Zoek taken..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <currentSortOption.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{currentSortOption.label}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover z-50">
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => handleSortChange(option.value)}
                className={filters.sortBy === option.value ? 'bg-accent' : ''}
              >
                <option.icon className="h-4 w-4 mr-2" />
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="icon"
          onClick={toggleSortDirection}
          title={filters.sortDirection === 'asc' ? 'Oplopend' : 'Aflopend'}
        >
          <ArrowUpDown className={`h-4 w-4 transition-transform ${
            filters.sortDirection === 'desc' ? 'rotate-180' : ''
          }`} />
        </Button>

        {/* Task count */}
        {taskCount !== totalCount && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {taskCount} van {totalCount} taken
          </span>
        )}
      </div>
    </div>
  );
}
