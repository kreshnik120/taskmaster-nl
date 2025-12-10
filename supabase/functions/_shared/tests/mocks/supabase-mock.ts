/**
 * Supabase Mock Helper for Unit Tests
 * Provides configurable mock for Supabase client operations
 * 
 * @module _shared/tests/mocks/supabase-mock
 */

export interface MockQueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export interface MockRpcResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface MockConfig {
  selectResults?: Map<string, MockQueryResult>;
  insertResults?: Map<string, MockQueryResult>;
  updateResults?: Map<string, MockQueryResult>;
  deleteResults?: Map<string, MockQueryResult>;
  rpcResults?: Map<string, MockRpcResult>;
  defaultSelectResult?: MockQueryResult;
  defaultInsertResult?: MockQueryResult;
  defaultUpdateResult?: MockQueryResult;
  defaultRpcResult?: MockRpcResult;
}

/**
 * Creates a chainable query builder mock
 */
function createQueryBuilder(config: MockConfig, table: string, operation: 'select' | 'insert' | 'update' | 'delete') {
  let currentKey = table;
  const filters: Record<string, unknown> = {};
  
  const builder = {
    select: (columns?: string) => {
      currentKey = `${table}:select:${columns ?? '*'}`;
      return builder;
    },
    insert: (data: unknown) => {
      currentKey = `${table}:insert`;
      return builder;
    },
    update: (data: unknown) => {
      currentKey = `${table}:update`;
      return builder;
    },
    delete: () => {
      currentKey = `${table}:delete`;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      currentKey = `${currentKey}:eq:${column}:${value}`;
      return builder;
    },
    neq: (column: string, value: unknown) => {
      filters[`${column}_neq`] = value;
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      currentKey = `${currentKey}:in:${column}`;
      return builder;
    },
    is: (column: string, value: unknown) => {
      filters[`${column}_is`] = value;
      currentKey = `${currentKey}:is:${column}:${value}`;
      return builder;
    },
    gte: (column: string, value: unknown) => {
      filters[`${column}_gte`] = value;
      return builder;
    },
    lte: (column: string, value: unknown) => {
      filters[`${column}_lte`] = value;
      return builder;
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      return builder;
    },
    limit: (count: number) => {
      return builder;
    },
    single: () => {
      const resultsMap = operation === 'select' ? config.selectResults :
                        operation === 'insert' ? config.insertResults :
                        operation === 'update' ? config.updateResults :
                        config.deleteResults;
      
      const result = resultsMap?.get(currentKey) ?? 
                    resultsMap?.get(table) ?? 
                    getDefaultResult(config, operation);
      
      return Promise.resolve(result);
    },
    maybeSingle: () => {
      const resultsMap = config.selectResults;
      const result = resultsMap?.get(currentKey) ?? 
                    resultsMap?.get(table) ?? 
                    config.defaultSelectResult ?? 
                    { data: null, error: null };
      
      return Promise.resolve(result);
    },
    then: (resolve: (value: MockQueryResult) => void) => {
      const resultsMap = operation === 'select' ? config.selectResults :
                        operation === 'insert' ? config.insertResults :
                        operation === 'update' ? config.updateResults :
                        config.deleteResults;
      
      const result = resultsMap?.get(currentKey) ?? 
                    resultsMap?.get(table) ?? 
                    getDefaultResult(config, operation);
      
      resolve(result);
    },
  };
  
  // Make builder thenable
  (builder as any)[Symbol.toStringTag] = 'Promise';
  
  return builder;
}

function getDefaultResult(config: MockConfig, operation: string): MockQueryResult {
  switch (operation) {
    case 'select':
      return config.defaultSelectResult ?? { data: [], error: null };
    case 'insert':
      return config.defaultInsertResult ?? { data: { id: 'mock-id' }, error: null };
    case 'update':
      return config.defaultUpdateResult ?? { data: null, error: null };
    case 'delete':
      return { data: null, error: null };
    default:
      return { data: null, error: null };
  }
}

/**
 * Creates a mock Supabase client with configurable responses
 */
export function createMockSupabase(config: MockConfig = {}) {
  const callLog: Array<{ method: string; args: unknown[] }> = [];
  
  const mock = {
    from: (table: string) => {
      callLog.push({ method: 'from', args: [table] });
      return {
        select: (columns?: string) => {
          callLog.push({ method: 'select', args: [columns] });
          return createQueryBuilder(config, table, 'select');
        },
        insert: (data: unknown) => {
          callLog.push({ method: 'insert', args: [data] });
          return createQueryBuilder(config, table, 'insert');
        },
        update: (data: unknown) => {
          callLog.push({ method: 'update', args: [data] });
          return createQueryBuilder(config, table, 'update');
        },
        delete: () => {
          callLog.push({ method: 'delete', args: [] });
          return createQueryBuilder(config, table, 'delete');
        },
      };
    },
    
    rpc: (functionName: string, params?: Record<string, unknown>) => {
      callLog.push({ method: 'rpc', args: [functionName, params] });
      
      const result = config.rpcResults?.get(functionName) ?? 
                    config.defaultRpcResult ?? 
                    { success: true };
      
      return Promise.resolve({
        data: result,
        error: result.success === false ? { message: result.error ?? 'RPC failed' } : null,
      });
    },
    
    // Helper to get call log for assertions
    _getCallLog: () => callLog,
    _clearCallLog: () => { callLog.length = 0; },
  };
  
  return mock;
}

/**
 * Helper to create a successful select result
 */
export function mockSelectResult(data: unknown): MockQueryResult {
  return { data, error: null };
}

/**
 * Helper to create a failed result
 */
export function mockError(message: string, code?: string): MockQueryResult {
  return { data: null, error: { message, code } };
}

/**
 * Helper to create RPC success result
 */
export function mockRpcSuccess(data: Record<string, unknown> = {}): MockRpcResult {
  return { success: true, ...data };
}

/**
 * Helper to create RPC failure result
 */
export function mockRpcFailure(error: string): MockRpcResult {
  return { success: false, error };
}
