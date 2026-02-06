export interface DiffSegment {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

/**
 * Computes a word-level diff between two strings.
 * Returns an array of segments indicating what was unchanged, added, or removed.
 */
export function computeWordDiff(oldText: string, newText: string): DiffSegment[] {
  if (!oldText && !newText) return [];
  if (!oldText) return [{ type: 'added', text: newText }];
  if (!newText) return [{ type: 'removed', text: oldText }];
  
  // Split by words while preserving whitespace
  const oldWords = splitIntoTokens(oldText);
  const newWords = splitIntoTokens(newText);
  
  // Use Longest Common Subsequence algorithm
  const lcs = computeLCS(oldWords, newWords);
  
  const result: DiffSegment[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let lcsIndex = 0;
  
  while (oldIndex < oldWords.length || newIndex < newWords.length) {
    if (lcsIndex < lcs.length && 
        oldIndex < oldWords.length && 
        newIndex < newWords.length &&
        oldWords[oldIndex] === lcs[lcsIndex] && 
        newWords[newIndex] === lcs[lcsIndex]) {
      // Common word
      addSegment(result, 'unchanged', oldWords[oldIndex]);
      oldIndex++;
      newIndex++;
      lcsIndex++;
    } else if (newIndex < newWords.length && 
               (lcsIndex >= lcs.length || newWords[newIndex] !== lcs[lcsIndex])) {
      // Added word
      addSegment(result, 'added', newWords[newIndex]);
      newIndex++;
    } else if (oldIndex < oldWords.length) {
      // Removed word
      addSegment(result, 'removed', oldWords[oldIndex]);
      oldIndex++;
    }
  }
  
  return mergeAdjacentSegments(result);
}

/**
 * Split text into tokens (words and whitespace) for diff comparison
 */
function splitIntoTokens(text: string): string[] {
  // Split by whitespace but keep the whitespace as separate tokens
  return text.split(/(\s+)/).filter(token => token.length > 0);
}

/**
 * Compute Longest Common Subsequence
 */
function computeLCS(arr1: string[], arr2: string[]): string[] {
  const m = arr1.length;
  const n = arr2.length;
  
  // Build LCS matrix
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m, j = n;
  
  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      lcs.unshift(arr1[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return lcs;
}

/**
 * Add segment to result, merging with previous if same type
 */
function addSegment(result: DiffSegment[], type: DiffSegment['type'], text: string) {
  const last = result[result.length - 1];
  if (last && last.type === type) {
    last.text += text;
  } else {
    result.push({ type, text });
  }
}

/**
 * Merge adjacent segments of the same type
 */
function mergeAdjacentSegments(segments: DiffSegment[]): DiffSegment[] {
  if (segments.length === 0) return segments;
  
  const merged: DiffSegment[] = [];
  
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && last.type === segment.type) {
      last.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  
  return merged;
}

/**
 * Check if the diff is simple enough to display inline
 * Returns false if there are too many changes (suggesting a complete rewrite)
 */
export function isDiffSimple(segments: DiffSegment[]): boolean {
  const totalLength = segments.reduce((sum, s) => sum + s.text.length, 0);
  const changedLength = segments
    .filter(s => s.type !== 'unchanged')
    .reduce((sum, s) => sum + s.text.length, 0);
  
  // If more than 80% is changed, it's essentially a rewrite
  return changedLength / totalLength < 0.8;
}
