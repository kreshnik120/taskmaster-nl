import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Test configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Test users (moet je aanmaken in je test database)
const ADMIN_USER_EMAIL = "admin@test.com";
const ADMIN_USER_PASSWORD = "testpassword123";
const REGULAR_USER_EMAIL = "user@test.com";
const REGULAR_USER_PASSWORD = "testpassword123";

Deno.test("bulk-delete: Admin can soft-delete knowledge in their org", async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // 1. Login as admin
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_USER_EMAIL,
    password: ADMIN_USER_PASSWORD,
  });
  assertExists(authData.session, "Admin login failed");

  // 2. Create test knowledge item
  const { data: knowledgeItem, error: insertError } = await supabase
    .from("ai_knowledge_base")
    .insert({
      category: "test_bulk_delete",
      key: "test_key_" + Date.now(),
      value: { test: "data" },
    })
    .select()
    .single();

  assertExists(knowledgeItem, "Failed to create test knowledge");

  // 3. Call bulk-delete function
  const { data: result, error: funcError } = await supabase.functions.invoke(
    "bulk-delete-knowledge",
    {
      body: {
        knowledgeIds: [knowledgeItem.id],
        reason: "integration_test",
      },
    }
  );

  assertEquals(funcError, null, "Function should not error");
  assertEquals(result.success, true);
  assertEquals(result.deletedCount, 1);

  // 4. Verify soft-delete (item should have deleted_at set)
  const { data: deletedItem } = await supabase
    .from("ai_knowledge_base")
    .select("deleted_at, deleted_by")
    .eq("id", knowledgeItem.id)
    .single();

  assertExists(deletedItem?.deleted_at, "Item should be soft-deleted");
  assertEquals(deletedItem?.deleted_by, authData.user.id);

  // Cleanup
  await supabase.auth.signOut();
});

Deno.test("bulk-delete: Regular user CANNOT soft-delete knowledge", async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // 1. Login as regular user
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: REGULAR_USER_EMAIL,
    password: REGULAR_USER_PASSWORD,
  });
  assertExists(authData.session, "User login failed");

  // 2. Try to call bulk-delete (should fail)
  const { data: result, error: funcError } = await supabase.functions.invoke(
    "bulk-delete-knowledge",
    {
      body: {
        knowledgeIds: ["00000000-0000-0000-0000-000000000001"], // Dummy ID
        reason: "should_fail",
      },
    }
  );

  // Function doesn't error, but deletedCount should be 0
  assertEquals(result.deletedCount, 0, "Regular user should not delete anything");

  // Cleanup
  await supabase.auth.signOut();
});

Deno.test("bulk-delete: Input validation rejects invalid UUIDs", async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: ADMIN_USER_EMAIL,
    password: ADMIN_USER_PASSWORD,
  });

  const { data: result, error: funcError } = await supabase.functions.invoke(
    "bulk-delete-knowledge",
    {
      body: {
        knowledgeIds: ["invalid-uuid", "also-invalid"],
        reason: "test",
      },
    }
  );

  assertExists(funcError || result.error, "Should reject invalid UUIDs");
  
  await supabase.auth.signOut();
});

Deno.test("bulk-delete: Input validation rejects > 100 items", async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: ADMIN_USER_EMAIL,
    password: ADMIN_USER_PASSWORD,
  });

  const tooManyIds = Array(101).fill(0).map((_, i) => 
    `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`
  );

  const { data: result, error: funcError } = await supabase.functions.invoke(
    "bulk-delete-knowledge",
    {
      body: {
        knowledgeIds: tooManyIds,
        reason: "test",
      },
    }
  );

  assertExists(funcError || result.error, "Should reject > 100 items");
  
  await supabase.auth.signOut();
});

Deno.test("bulk-delete: User CANNOT delete items from other org", async () => {
  // TODO: Implementeer multi-org test setup
  // Vereist: 2 orgs, 2 admin users, test data in beide orgs
  console.log("⚠️  Multi-org test not yet implemented - requires test data setup");
});
