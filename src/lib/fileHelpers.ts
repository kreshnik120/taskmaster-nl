// File helper utilities for attachment handling

export type FileCategory = 'image' | 'pdf' | 'word' | 'excel' | 'other';

/**
 * Determine file category based on filename extension
 */
export function getFileCategory(filename: string): FileCategory {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'word';
  if (['xls', 'xlsx'].includes(ext)) return 'excel';
  return 'other';
}

/**
 * Check if file can be previewed in-browser
 */
export function canPreview(filename: string): boolean {
  const category = getFileCategory(filename);
  return category === 'image' || category === 'pdf';
}

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

/**
 * Get display label for file category
 */
export function getFileCategoryLabel(category: FileCategory): string {
  const labels: Record<FileCategory, string> = {
    image: 'Afbeelding',
    pdf: 'PDF',
    word: 'Word',
    excel: 'Excel',
    other: 'Overig'
  };
  return labels[category];
}

/**
 * Get badge color class for file category
 */
export function getFileCategoryColor(category: FileCategory): string {
  const colors: Record<FileCategory, string> = {
    image: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    pdf: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    word: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    excel: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    other: 'bg-muted text-muted-foreground'
  };
  return colors[category];
}
