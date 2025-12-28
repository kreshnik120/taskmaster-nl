/**
 * Test Runner Script for Shared Learning Modules
 * 
 * Run all tests:
 *   deno test --allow-env supabase/functions/_shared/tests/
 * 
 * Run specific test file:
 *   deno test --allow-env supabase/functions/_shared/tests/confidence-calculator.test.ts
 * 
 * Run with verbose output:
 *   deno test --allow-env --reporter=dot supabase/functions/_shared/tests/
 * 
 * Run with coverage:
 *   deno test --allow-env --coverage=coverage supabase/functions/_shared/tests/
 */

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          Shared Learning Modules - Unit Test Suite            ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Test Files:                                                  ║
║  • confidence-calculator.test.ts  (~45 tests)                 ║
║  • knowledge-crud.test.ts         (~30 tests)                 ║
║  • learning-engine.test.ts        (~25 tests)                 ║
║  • semantic-retrieval.test.ts     (~12 tests)                 ║
║                                                               ║
║  Total: ~112 test cases                                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Usage:                                                       ║
║                                                               ║
║  Run all tests:                                               ║
║    deno test --allow-env supabase/functions/_shared/tests/    ║
║                                                               ║
║  Run with filter:                                             ║
║    deno test --allow-env --filter="clampConfidence" ...       ║
║                                                               ║
║  Run with coverage:                                           ║
║    deno test --allow-env --coverage=cov ...                   ║
║    deno coverage cov                                          ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

// Import all test files to make them available
import './confidence-calculator.test.ts';
import './knowledge-crud.test.ts';
import './learning-engine.test.ts';
import './semantic-retrieval.test.ts';
