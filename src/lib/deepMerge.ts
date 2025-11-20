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
 * Zet een waarde in een genest object via een dot-notated path
 * Bijv: setNestedValue(obj, "value.opmerkingen", "text") 
 * -> obj.value.opmerkingen = "text"
 */
export function setNestedValue(obj: any, path: string, value: any): any {
  const keys = path.split('.');
  const result = { ...obj };
  let current = result;

  // Navigeer naar het parent object
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    
    // Maak nested object aan als het niet bestaat
    if (!(key in current) || !isObject(current[key])) {
      current[key] = {};
    } else {
      // Clone om mutatie te voorkomen
      current[key] = { ...current[key] };
    }
    
    current = current[key];
  }

  // Zet de waarde op het laatste niveau
  current[keys[keys.length - 1]] = value;
  
  return result;
}

/**
 * Haalt een waarde op uit een genest object via een dot-notated path
 */
export function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }

  return current;
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
