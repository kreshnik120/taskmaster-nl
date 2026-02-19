import {
  corsHeaders,
  handleCors,
  createAdminClient,
  createAnonClient,
  jsonResponse,
  errorResponse,
  logInfo,
  logWarning,
} from '../_shared/core.ts';

const FUNCTION_NAME = 'bsn-vault';

function getEncryptionKey(): string {
  const key = Deno.env.get('BSN_ENCRYPTION_KEY');
  if (!key || key.length < 32) {
    throw new Error('BSN_ENCRYPTION_KEY niet geconfigureerd of te kort (min 32 tekens)');
  }
  return key;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Auth check: JWT + admin role
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return errorResponse('Niet geautoriseerd — login vereist', 401);
    }

    const anonClient = createAnonClient(authHeader);
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return errorResponse('Ongeldige sessie — log opnieuw in', 401);
    }

    const adminClient = createAdminClient();

    // Admin-only check
    const { data: isAdmin } = await adminClient.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    });

    if (!isAdmin) {
      return errorResponse('Admin toegang vereist', 403);
    }

    const body = await req.json();

    // ════════════════════════════════════════
    // ACTIE: decrypt
    // ════════════════════════════════════════
    if (body.action === 'decrypt') {
      const professionalId = body.professional_id;
      if (!professionalId) {
        return errorResponse('professional_id vereist', 400);
      }

      // Audit log EERST
      await adminClient.from('security_audit_log').insert({
        user_id: user.id,
        event_type: 'bsn_access',
        action: 'bsn_decrypted',
        entity_type: 'professional',
        entity_id: professionalId,
        details: { method: 'bsn-vault', ip: req.headers.get('x-forwarded-for') || 'unknown' },
      });

      const { data: bsnRow } = await adminClient
        .from('professional_bsn')
        .select('encrypted_bsn, bsn_encrypted, is_encrypted')
        .eq('professional_id', professionalId)
        .maybeSingle();

      if (!bsnRow) {
        return jsonResponse({ bsn: null });
      }

      let bsnValue: string | null = null;

      if (bsnRow.is_encrypted && bsnRow.bsn_encrypted) {
        const encryptionKey = getEncryptionKey();
        const { data: decrypted, error: decryptError } = await adminClient.rpc(
          'decrypt_bsn',
          { p_encrypted: bsnRow.bsn_encrypted, p_key: encryptionKey }
        );

        if (decryptError) {
          logWarning(FUNCTION_NAME, `Decrypt error: ${decryptError.message}`);
          return errorResponse('Decryptie mislukt', 500);
        }

        bsnValue = decrypted;
      } else if (bsnRow.encrypted_bsn && bsnRow.encrypted_bsn !== '[ENCRYPTED]') {
        // Nog niet gemigreerd — geef plaintext terug (tijdelijk)
        bsnValue = bsnRow.encrypted_bsn;
      }

      return jsonResponse({ bsn: bsnValue });
    }

    // ════════════════════════════════════════
    // ACTIE: migrate
    // ════════════════════════════════════════
    if (body.action === 'migrate') {
      const encryptionKey = getEncryptionKey();

      const { data: unencrypted } = await adminClient
        .from('professional_bsn')
        .select('id, encrypted_bsn')
        .eq('is_encrypted', false)
        .not('encrypted_bsn', 'is', null)
        .neq('encrypted_bsn', '[ENCRYPTED]');

      if (!unencrypted || unencrypted.length === 0) {
        return jsonResponse({ migrated: 0, failed: 0, message: 'Geen plaintext BSN\'s gevonden' });
      }

      let migrated = 0;
      let failed = 0;

      for (const row of unencrypted) {
        try {
          const { data: encrypted, error: encError } = await adminClient.rpc(
            'encrypt_bsn',
            { p_plaintext: row.encrypted_bsn, p_key: encryptionKey }
          );

          if (encError) { failed++; continue; }

          await adminClient
            .from('professional_bsn')
            .update({
              bsn_encrypted: encrypted,
              encrypted_bsn: '[ENCRYPTED]',
              is_encrypted: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id);

          migrated++;
        } catch {
          failed++;
        }
      }

      // Audit log
      await adminClient.from('security_audit_log').insert({
        user_id: user.id,
        event_type: 'bsn_migration',
        action: 'bsn_bulk_encrypted',
        entity_type: 'system',
        entity_id: null,
        details: { migrated, failed, total: unencrypted.length },
      });

      logInfo(FUNCTION_NAME, `BSN migratie: ${migrated} versleuteld, ${failed} mislukt van ${unencrypted.length}`);

      return jsonResponse({ migrated, failed, total: unencrypted.length });
    }

    // ════════════════════════════════════════
    // ACTIE: status
    // ════════════════════════════════════════
    if (body.action === 'status') {
      const { count: totalBsn } = await adminClient
        .from('professional_bsn')
        .select('id', { count: 'exact', head: true });

      const { count: encryptedCount } = await adminClient
        .from('professional_bsn')
        .select('id', { count: 'exact', head: true })
        .eq('is_encrypted', true);

      const { count: plaintextCount } = await adminClient
        .from('professional_bsn')
        .select('id', { count: 'exact', head: true })
        .eq('is_encrypted', false);

      return jsonResponse({
        total: totalBsn || 0,
        encrypted: encryptedCount || 0,
        plaintext: plaintextCount || 0,
        fully_encrypted: (plaintextCount || 0) === 0 && (totalBsn || 0) > 0,
      });
    }

    return errorResponse('Onbekende actie. Beschikbaar: decrypt, migrate, status', 400);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logWarning(FUNCTION_NAME, `Error: ${msg}`);
    return errorResponse(msg, 500);
  }
});
