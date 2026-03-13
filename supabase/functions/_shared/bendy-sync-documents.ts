/**
 * BENDY SYNC — Document sync logic
 */

import { logInfo } from './core.ts';
import {
  FUNCTION_NAME,
  fetchBendyApi,
  batchUpsert,
  batchInsert,
  parallelUpdates,
  deriveFunctieNiveauFromDiplomas,
  type SyncResult,
} from './bendy-helpers.ts';

export async function syncDocuments(
  adminClient: any,
  tenant: string,
  orgId: string,
  _syncType: string,
): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  logInfo(FUNCTION_NAME, `Document sync gestart voor ${tenant}`);

  const { data: professionals } = await adminClient
    .from('professionals')
    .select('id, bendy_id, full_name')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .not('bendy_id', 'is', null)
    .limit(5000);

  if (!professionals || professionals.length === 0) {
    logInfo(FUNCTION_NAME, 'Geen professionals met bendy_id gevonden');
    return result;
  }

  logInfo(FUNCTION_NAME, `${professionals.length} professionals met bendy_id gevonden`);

  const DOC_PARALLEL_SIZE = 10;

  for (let i = 0; i < professionals.length; i += DOC_PARALLEL_SIZE) {
    const chunk = professionals.slice(i, i + DOC_PARALLEL_SIZE);

    const fetchResults = await Promise.allSettled(
      chunk.map(async (pro: any) => {
        const endpoint = `/api/v2/users/${pro.bendy_id}/documents`;
        const response = await fetchBendyApi(tenant, endpoint);
        return { pro, documents: response?.data || [] };
      })
    );

    const existingDocsResults = await Promise.allSettled(
      chunk.map(async (pro: any) => {
        const { data } = await adminClient
          .from('professional_documents')
          .select('id, bendy_document_id')
          .eq('professional_id', pro.id);
        return { proId: pro.id, docs: data || [] };
      })
    );

    const existingDocsMap = new Map<string, Map<string, any>>();
    for (const settledResult of existingDocsResults) {
      if (settledResult.status === 'fulfilled') {
        const { proId, docs } = settledResult.value;
        const docMap = new Map<string, any>();
        for (const doc of docs) {
          docMap.set(doc.bendy_document_id, doc);
        }
        existingDocsMap.set(proId, docMap);
      }
    }

    const cacheWrites: any[] = [];
    const docInserts: any[] = [];
    const docUpdates: Array<{ id: string; data: Record<string, any> }> = [];
    const proMetaUpdates: Array<{ id: string; data: Record<string, any> }> = [];

    for (const settledResult of fetchResults) {
      if (settledResult.status === 'rejected') {
        result.failed++;
        result.errors.push(`Doc fetch gefaald: ${String(settledResult.reason).substring(0, 200)}`);
        continue;
      }

      const { pro, documents } = settledResult.value;
      if (documents.length === 0) continue;

      result.fetched += documents.length;
      const existingMap = existingDocsMap.get(pro.id) || new Map();
      let docCount = 0;
      let expiringCount = 0;

      for (const bendyDoc of documents) {
        try {
          const docId = String(bendyDoc.id);
          const attrs = bendyDoc.attributes || {};

          cacheWrites.push({
            org_id: orgId, tenant, entity_type: 'documents',
            bendy_id: docId, raw_data: bendyDoc,
            fetched_at: new Date().toISOString(),
          });

          const docData = {
            professional_id: pro.id, org_id: orgId,
            bendy_document_id: docId,
            document_name: attrs.name || 'Onbekend document',
            document_type: attrs.document_type || null,
            document_number: attrs.document_number || null,
            issuer: attrs.issuer || null, source: attrs.source || null,
            start_date: attrs.start_date || null, expires_at: attrs.expires_at || null,
            status: attrs.status || 'active', published: attrs.published || false,
            bendy_created_at: attrs.created_at || null,
            bendy_updated_at: attrs.updated_at || null,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const existing = existingMap.get(docId);
          if (existing) {
            docUpdates.push({ id: existing.id, data: docData });
            result.updated++;
          } else {
            docInserts.push(docData);
            result.created++;
          }

          docCount++;

          if (attrs.expires_at) {
            const expiryDate = new Date(attrs.expires_at);
            const now = new Date();
            const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
            if (expiryDate <= ninetyDaysFromNow) expiringCount++;
          }
        } catch (docError) {
          result.failed++;
          const msg = docError instanceof Error ? docError.message : String(docError);
          result.errors.push(`Doc ${bendyDoc.id} voor ${pro.full_name}: ${msg.substring(0, 200)}`);
        }
      }

      const { data: proDocs } = await adminClient
        .from('professional_documents')
        .select('document_name, document_type, expires_at, published')
        .eq('professional_id', pro.id);
      const diplomaNiveau = deriveFunctieNiveauFromDiplomas(proDocs || []);

      const now = new Date();
      const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const dbDocCount = proDocs?.length || 0;
      const dbExpiringCount = (proDocs || []).filter(d =>
        d.expires_at && new Date(d.expires_at) <= ninetyDaysFromNow
      ).length;
      const dbPublishedCount = (proDocs || []).filter(d => d.published === true).length;

      const metaData: Record<string, any> = {
        documents_synced_at: new Date().toISOString(),
        documents_count: dbDocCount,
        documents_published_count: dbPublishedCount,
        documents_expiring_count: dbExpiringCount,
      };
      if (diplomaNiveau) metaData.functie_niveau = diplomaNiveau;

      proMetaUpdates.push({ id: pro.id, data: metaData });
    }

    if (cacheWrites.length > 0) await batchUpsert(adminClient, 'bendy_raw_cache', cacheWrites, 'tenant,entity_type,bendy_id');
    if (docInserts.length > 0) await batchInsert(adminClient, 'professional_documents', docInserts);
    if (docUpdates.length > 0) await parallelUpdates(adminClient, 'professional_documents', docUpdates);
    if (proMetaUpdates.length > 0) await parallelUpdates(adminClient, 'professionals', proMetaUpdates);
  }

  logInfo(FUNCTION_NAME, `Document sync voltooid: ${result.fetched} opgehaald, ${result.created} nieuw, ${result.updated} bijgewerkt, ${result.failed} gefaald`);
  return result;
}
