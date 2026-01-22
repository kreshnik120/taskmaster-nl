/**
 * Deep merge utility voor het correct samenvoegen van geneste objecten
 * Voorkomt data corruption bij conflict resolutions
 */

type DeepMergeable = Record<string, any> | any[];

function isObject(item: any): item is Record<string, any> {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Voert een diepe merge uit van source in target
 * Arrays worden vervangen (niet gemerged)
 * Objecten worden recursief gemerged
 */
export function deepMerge<T extends DeepMergeable>(target: T, source: Partial<T>): T {
  // Als beide arrays zijn, vervang de target array met source
  if (Array.isArray(target) && Array.isArray(source)) {
    return source as T;
  }

  // Als beide objecten zijn, merge recursief
  if (isObject(target) && isObject(source)) {
    const result = { ...target };
    
    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = result[key];
      
      // Als beide waarden objecten zijn (en geen arrays), merge recursief
      if (isObject(targetValue) && isObject(sourceValue)) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        // Anders: vervang met source waarde (ook voor arrays)
        result[key] = sourceValue;
      }
    }
    
    return result as T;
  }

  // Voor primitieve waarden: gebruik source
  return source as T;
}


/**
 * Detecteert duplicate velden tussen top-level en nested structuren
 * Retourneert array van field names die duplicaat zijn
 */
export function detectDuplicateFields(obj: any): string[] {
  const duplicates: string[] = [];
  
  if (!isObject(obj)) return duplicates;
  
  // Check of er een 'value' property is met nested fields
  if (obj.value && isObject(obj.value)) {
    const topLevelKeys = Object.keys(obj);
    const nestedKeys = Object.keys(obj.value);
    
    // Find intersectie: fields die op beide niveaus voorkomen
    for (const key of topLevelKeys) {
      if (key !== 'value' && nestedKeys.includes(key)) {
        duplicates.push(key);
      }
    }
  }
  
  return duplicates;
}

/**
 * Verwijdert duplicate velden door alleen nested versie te behouden
 * (Top-level duplicaten worden verwijderd)
 */
export function cleanupDuplicateFields(obj: any): any {
  if (!isObject(obj)) return obj;
  
  const duplicates = detectDuplicateFields(obj);
  
  if (duplicates.length === 0) return obj;
  
  const result = { ...obj };
  
  // Verwijder top-level duplicaten
  for (const field of duplicates) {
    delete result[field];
  }
  
  return result;
}
