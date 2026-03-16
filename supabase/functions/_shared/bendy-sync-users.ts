/**
 * BENDY SYNC — User/Professional sync logic
 */

import { logInfo, logWarning } from './core.ts';
import {
  FUNCTION_NAME,
  fetchAllBendyRecords,
  fetchBendyApi,
  batchUpsert,
  batchInsert,
  parallelUpdates,
  buildFullName,
  deriveFunctieNiveau,
  deriveFunctieNiveauFromDiplomas,
  parseCertificates,
  mapWerkvorm,
  type SyncResult,
} from './bendy-helpers.ts';

export async function syncUsers(
  adminClient: any,
  tenant: string,
  orgId: string,
  _syncType: string,
): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  logInfo(FUNCTION_NAME, `Professional sync gestart voor ${tenant}`);

  const { records: bendyUsers, included: bendyIncluded } = await fetchAllBendyRecords(tenant, '/api/v2/users', { include: 'groups,company' });
  result.fetched = bendyUsers.length;
  logInfo(FUNCTION_NAME, `${bendyUsers.length} Bendy users opgehaald`);
  if (bendyUsers.length === 0) return result;

  const professionals: any[] = [];
  {
    const PRO_PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data: chunk } = await adminClient
        .from('professionals')
        .select('id, full_name, email, bendy_id, telefoonnummer, status, org_id, voorletters, geboorteplaats, geslacht, geboortedatum, profile_photo_url, bendy_external_id, certificaten, bedrijfsnaam, kvk_nummer, btw_nummer, iban, big_nummer, agb_code, skj_registratie, iban_tenaamstelling, boekhouding_email, bedrijfstelefoon, bendy_username, bendy_mediator_id, bendy_function_type, bendy_created_at, werkvorm, bendy_groepen, functie_niveau')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .range(offset, offset + PRO_PAGE - 1);
      if (!chunk || chunk.length === 0) break;
      professionals.push(...chunk);
      if (chunk.length < PRO_PAGE) break;
      offset += PRO_PAGE;
    }
    logInfo(FUNCTION_NAME, `${professionals.length} professionals opgehaald via paginatie`);
  }

  const bendyIdMap = new Map<string, any>();
  const emailMap = new Map<string, any>();
  for (const p of professionals) {
    if (p.bendy_id) bendyIdMap.set(String(p.bendy_id), p);
    if (p.email) emailMap.set(p.email.trim().toLowerCase(), p);
  }

  const { records: bendyGroups } = await fetchAllBendyRecords(tenant, '/api/v2/groups');
  const groupMap = new Map<string, string>();
  for (const group of bendyGroups) {
    groupMap.set(String(group.id), (group.attributes?.name || '').trim());
  }
  logInfo(FUNCTION_NAME, `${groupMap.size} Bendy groepen opgehaald voor functie mapping`);

  const { records: selectionLists } = await fetchAllBendyRecords(tenant, '/api/v2/selection_lists');
  const selectionListMap = new Map<string, string>();
  for (const item of selectionLists) {
    const code = (item.attributes?.key || '').trim();
    const name = (item.attributes?.name || item.attributes?.value || '').trim();
    if (code && name) selectionListMap.set(code, name);
  }
  logInfo(FUNCTION_NAME, `${selectionListMap.size} selection list items opgehaald voor code-decodering`);

  const companyMap = new Map<string, any>();
  for (const item of bendyIncluded) {
    if (item.type === 'companies') {
      companyMap.set(String(item.id), item.attributes || {});
    }
  }
  logInfo(FUNCTION_NAME, `${companyMap.size} company records uit included data`);

  const allProIds = professionals.map((p: any) => p.id);
  const proDocsMap = new Map<string, Array<{ document_name: string; document_type: string | null }>>();
  if (allProIds.length > 0) {
    for (let i = 0; i < allProIds.length; i += 500) {
      const batch = allProIds.slice(i, i + 500);
      const { data: batchDocs } = await adminClient
        .from('professional_documents')
        .select('professional_id, document_name, document_type')
        .in('professional_id', batch);
      for (const doc of (batchDocs || [])) {
        const existing = proDocsMap.get(doc.professional_id) || [];
        existing.push({ document_name: doc.document_name, document_type: doc.document_type });
        proDocsMap.set(doc.professional_id, existing);
      }
    }
    logInfo(FUNCTION_NAME, `${proDocsMap.size} professionals met documenten pre-fetched (${allProIds.length} totaal)`);
  }

  const cacheWrites: any[] = [];
  const proUpdates: Array<{ id: string; data: Record<string, any> }> = [];
  const proInserts: Array<{ insertData: Record<string, any>; bendyId: string; bsn: string | null }> = [];
  const bsnWrites: any[] = [];
  const mappingWrites: any[] = [];

  for (const bendyUser of bendyUsers) {
    try {
      const bendyId = String(bendyUser.id);
      const attrs = bendyUser.attributes || {};

      const sanitizedUser = JSON.parse(JSON.stringify(bendyUser));
      if (sanitizedUser.attributes?.citizen_service_number) {
        sanitizedUser.attributes.citizen_service_number = '[REDACTED]';
      }
      cacheWrites.push({
        org_id: orgId, tenant, entity_type: 'users',
        bendy_id: bendyId, raw_data: sanitizedUser,
        fetched_at: new Date().toISOString(),
      });

      let matchedPro: any = null;
      let emailSkipped = false;
      matchedPro = bendyIdMap.get(bendyId) || null;
      if (!matchedPro && attrs.email) {
        const bendyEmail = attrs.email.trim().toLowerCase();
        const emailPro = emailMap.get(bendyEmail) || null;
        if (emailPro) {
          if (!emailPro.bendy_id) {
            matchedPro = emailPro;
            emailMatchCount++;
          } else {
            emailSkipped = true;
            emailSkippedCount++;
            result.skipped++;
            logWarning(FUNCTION_NAME, `User ${bendyId}: email match maar ander bendy_id (${emailPro.bendy_id})`);
          }
        }
      }

      if (matchedPro) {
        const updateData: Record<string, any> = { bendy_id: bendyId };
        const fullName = buildFullName(attrs);
        if (fullName !== 'Onbekend' && fullName !== matchedPro.full_name) updateData.full_name = fullName;
        const effectivePhone = attrs.telephone || null;
        if (effectivePhone && effectivePhone !== matchedPro.telefoonnummer) updateData.telefoonnummer = effectivePhone;
        if (attrs.email && attrs.email !== matchedPro.email) updateData.email = attrs.email;

        if (attrs.initials && !matchedPro.voorletters) updateData.voorletters = attrs.initials;
        if (attrs.birthtown && !matchedPro.geboorteplaats) updateData.geboorteplaats = attrs.birthtown;
        if (attrs.gender && !matchedPro.geslacht) updateData.geslacht = attrs.gender;
        if (attrs.birthdate && !matchedPro.geboortedatum) updateData.geboortedatum = attrs.birthdate;
        if (attrs.photo_url && !matchedPro.profile_photo_url) updateData.profile_photo_url = attrs.photo_url;
        if (attrs.external_id && !matchedPro.bendy_external_id) updateData.bendy_external_id = String(attrs.external_id);
        if (attrs.certificates) {
          const parsed = parseCertificates(attrs.certificates);
          if (parsed && parsed.length > 0) updateData.certificaten = parsed;
        }

        const mappedWerkvorm = mapWerkvorm(attrs.professional_type || null);
        if (mappedWerkvorm && mappedWerkvorm !== matchedPro.werkvorm) updateData.werkvorm = mappedWerkvorm;

        const companyRelation = bendyUser.relationships?.company?.data;
        if (companyRelation) {
          const companyAttrs = companyMap.get(String(companyRelation.id));
          if (companyAttrs) {
            if (companyAttrs.name) updateData.bedrijfsnaam = companyAttrs.name;
            if (companyAttrs.chamber_of_commerce_number) updateData.kvk_nummer = companyAttrs.chamber_of_commerce_number;
            if (companyAttrs.vat_id) updateData.btw_nummer = companyAttrs.vat_id;
            if (companyAttrs.iban) updateData.iban = companyAttrs.iban;
            if (companyAttrs.big_number) updateData.big_nummer = companyAttrs.big_number;
            if (companyAttrs.agb_code) updateData.agb_code = companyAttrs.agb_code;
            if (companyAttrs.skj_registration_number) updateData.skj_registratie = companyAttrs.skj_registration_number;
            if (companyAttrs.iban_name_of) updateData.iban_tenaamstelling = companyAttrs.iban_name_of;
            if (companyAttrs.bookkeeping_email) updateData.boekhouding_email = companyAttrs.bookkeeping_email;
            if (companyAttrs.telephone) updateData.bedrijfstelefoon = companyAttrs.telephone;
          }
        }

        if (attrs.username && !matchedPro.bendy_username) updateData.bendy_username = attrs.username;
        if (attrs.mediator_id && !matchedPro.bendy_mediator_id) updateData.bendy_mediator_id = String(attrs.mediator_id);
        if (attrs.function_type && !matchedPro.bendy_function_type) updateData.bendy_function_type = attrs.function_type;
        if (attrs.created_at && !matchedPro.bendy_created_at) updateData.bendy_created_at = attrs.created_at;

        const bendyState = attrs.state?.toLowerCase();
        if (bendyState && ['inactief', 'geblokkeerd', 'verwijderd', 'blocked', 'deleted'].includes(bendyState)) {
          updateData.status = 'inactief';
        } else if (bendyState) {
          updateData.status = 'actief';
        }

        const userGroupIds = (bendyUser.relationships?.groups?.data || []).map((g: any) => String(g.id));
        const userGroupNames = userGroupIds.map((id: string) => groupMap.get(id)).filter(Boolean) as string[];
        updateData.bendy_groepen = userGroupNames.length > 0 ? userGroupNames : [];

        const rawFunctionType = attrs.function_type || null;
        const rawLevel = attrs.level || null;
        const decodedFunctionType = rawFunctionType ? (selectionListMap.get(rawFunctionType.replace(/^,/, '')) || rawFunctionType) : null;
        const decodedLevel = rawLevel ? (selectionListMap.get(rawLevel.replace(/^,/, '')) || rawLevel) : null;
        const proDocs = proDocsMap.get(matchedPro.id) || [];
        const diplomaNiveau = deriveFunctieNiveauFromDiplomas(proDocs);
        const functieNiveau = deriveFunctieNiveau(userGroupNames, decodedFunctionType, decodedLevel, diplomaNiveau);
        updateData.functie_niveau = functieNiveau;

        proUpdates.push({ id: matchedPro.id, data: updateData });

        if (attrs.citizen_service_number) {
          bsnWrites.push({
            professional_id: matchedPro.id,
            bsn_plaintext: attrs.citizen_service_number,
            updated_at: new Date().toISOString(),
          });
        }

        matchedPro.bendy_id = bendyId;
        bendyIdMap.set(bendyId, matchedPro);
        mappingWrites.push({
          org_id: orgId, tenant, entity_type: 'professional',
          bendy_id: bendyId, local_id: matchedPro.id,
          bendy_updated_at: attrs.updated_at || null,
          last_synced_at: new Date().toISOString(),
          sync_status: 'synced', conflict_data: null,
        });

        result.updated++;
      } else if (!emailSkipped) {
        const fullName = buildFullName(attrs);
        const userGroupIds = (bendyUser.relationships?.groups?.data || []).map((g: any) => String(g.id));
        const userGroupNames = userGroupIds.map((id: string) => groupMap.get(id)).filter(Boolean) as string[];
        const rawFunctionType = attrs.function_type || null;
        const rawLevel = attrs.level || null;
        const decodedFunctionType = rawFunctionType ? (selectionListMap.get(rawFunctionType.replace(/^,/, '')) || rawFunctionType) : null;
        const decodedLevel = rawLevel ? (selectionListMap.get(rawLevel.replace(/^,/, '')) || rawLevel) : null;
        let diplomaNiveau: string | null = null;
        try {
          const docsEndpoint = `/api/v2/users/${bendyId}/documents`;
          const docsResponse = await fetchBendyApi(tenant, docsEndpoint);
          const bendyDocs = (docsResponse?.data || []).map((d: any) => ({
            document_name: d.attributes?.name || '',
            document_type: d.attributes?.document_type || '',
          }));
          diplomaNiveau = deriveFunctieNiveauFromDiplomas(bendyDocs);
        } catch { /* documents ophalen faalde */ }
        const functieNiveau = deriveFunctieNiveau(userGroupNames, decodedFunctionType, decodedLevel, diplomaNiveau);
        const werkvorm = mapWerkvorm(attrs.professional_type || null);
        const isActive = attrs.state
          ? !['inactief', 'geblokkeerd', 'verwijderd', 'blocked', 'deleted'].includes(attrs.state.toLowerCase())
          : true;

        const insertData: Record<string, any> = {
          org_id: orgId, full_name: fullName, functie_niveau: functieNiveau,
          email: attrs.email || null, telefoonnummer: attrs.telephone || null,
          werkvorm: werkvorm, status: isActive ? 'actief' : 'inactief',
          geboortedatum: attrs.birthdate || null, profile_photo_url: attrs.photo_url || null,
          bendy_id: bendyId, voorletters: attrs.initials || null,
          geboorteplaats: attrs.birthtown || null, geslacht: attrs.gender || null,
          bendy_external_id: attrs.external_id ? String(attrs.external_id) : null,
          certificaten: parseCertificates(attrs.certificates),
          bendy_username: attrs.username || null,
          bendy_mediator_id: attrs.mediator_id ? String(attrs.mediator_id) : null,
          bendy_function_type: attrs.function_type || null,
          bendy_created_at: attrs.created_at || null,
          bendy_groepen: userGroupNames.length > 0 ? userGroupNames : [],
        };

        const companyRelation = bendyUser.relationships?.company?.data;
        if (companyRelation) {
          const companyAttrs = companyMap.get(String(companyRelation.id));
          if (companyAttrs) {
            if (companyAttrs.name) insertData.bedrijfsnaam = companyAttrs.name;
            if (companyAttrs.chamber_of_commerce_number) insertData.kvk_nummer = companyAttrs.chamber_of_commerce_number;
            if (companyAttrs.vat_id) insertData.btw_nummer = companyAttrs.vat_id;
            if (companyAttrs.iban) insertData.iban = companyAttrs.iban;
            if (companyAttrs.big_number) insertData.big_nummer = companyAttrs.big_number;
            if (companyAttrs.agb_code) insertData.agb_code = companyAttrs.agb_code;
            if (companyAttrs.skj_registration_number) insertData.skj_registratie = companyAttrs.skj_registration_number;
            if (companyAttrs.iban_name_of) insertData.iban_tenaamstelling = companyAttrs.iban_name_of;
            if (companyAttrs.bookkeeping_email) insertData.boekhouding_email = companyAttrs.bookkeeping_email;
            if (companyAttrs.telephone) insertData.bedrijfstelefoon = companyAttrs.telephone;
          }
        }

        proInserts.push({ insertData, bendyId, bsn: attrs.citizen_service_number || null });
      }
    } catch (error) {
      result.failed++;
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`User ${bendyUser.id}: ${msg.substring(0, 200)}`);
    }
  }

  logInfo(FUNCTION_NAME, `Batch writes: ${cacheWrites.length} cache, ${proUpdates.length} updates, ${proInserts.length} inserts`);

  await batchUpsert(adminClient, 'bendy_raw_cache', cacheWrites, 'tenant,entity_type,bendy_id');
  await parallelUpdates(adminClient, 'professionals', proUpdates);

  if (proInserts.length > 0) {

    const processNewPro = (newPro: any, original: typeof proInserts[0]) => {
      if (original.bsn) {
        bsnWrites.push({ professional_id: newPro.id, bsn_plaintext: original.bsn, updated_at: new Date().toISOString() });
      }
      mappingWrites.push({
        org_id: orgId, tenant, entity_type: 'professional',
        bendy_id: original.bendyId, local_id: newPro.id,
        last_synced_at: new Date().toISOString(), sync_status: 'synced', conflict_data: null,
      });
      result.created++;
    };

    const CHUNK_SIZE = 200;
    for (let i = 0; i < proInserts.length; i += CHUNK_SIZE) {
      const chunk = proInserts.slice(i, i + CHUNK_SIZE);
      const insertDataChunk = chunk.map(p => p.insertData);

      const { data, error } = await adminClient
        .from('professionals')
        .insert(insertDataChunk)
        .select('id');

      if (!error && data) {
        for (let idx = 0; idx < data.length; idx++) {
          processNewPro(data[idx], chunk[idx]);
        }
      } else {
        logWarning(FUNCTION_NAME, `Prof chunk ${i} failed: ${error?.message} — fallback per record`);

        const results = await Promise.allSettled(
          chunk.map(item =>
            adminClient.from('professionals').insert(item.insertData).select('id').single()
          )
        );

        for (let idx = 0; idx < results.length; idx++) {
          const r = results[idx];
          if (r.status === 'fulfilled' && r.value.data?.id) {
            processNewPro(r.value.data, chunk[idx]);
          } else {
            const errMsg = r.status === 'rejected' ? String(r.reason) : (r.value as any).error?.message;
            result.failed++;
            result.errors.push(`User ${chunk[idx].bendyId}: ${(errMsg || 'onbekend').substring(0, 200)}`);
          }
        }
      }
    }

  }

  if (bsnWrites.length > 0) {
    const encryptionKey = Deno.env.get('BSN_ENCRYPTION_KEY');
    if (!encryptionKey || encryptionKey.length < 32) {
      logWarning(FUNCTION_NAME, 'BSN_ENCRYPTION_KEY niet geconfigureerd — BSN opslag overgeslagen');
    } else {
      const encryptedBsnWrites: any[] = [];
      for (const bsnWrite of bsnWrites) {
        try {
          const { data: encrypted, error } = await adminClient.rpc('encrypt_bsn', {
            p_plaintext: bsnWrite.bsn_plaintext,
            p_key: encryptionKey,
          });

          if (error) {
            logWarning(FUNCTION_NAME, `BSN encryptie mislukt voor ${bsnWrite.professional_id}: ${error.message}`);
            continue;
          }

          encryptedBsnWrites.push({
            professional_id: bsnWrite.professional_id,
            bsn_encrypted: encrypted,
            encrypted_bsn: '[ENCRYPTED]',
            is_encrypted: true,
            updated_at: bsnWrite.updated_at,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logWarning(FUNCTION_NAME, `BSN encryptie error: ${msg}`);
        }
      }
      if (encryptedBsnWrites.length > 0) {
        await batchUpsert(adminClient, 'professional_bsn', encryptedBsnWrites, 'professional_id');
        logInfo(FUNCTION_NAME, `${encryptedBsnWrites.length} BSN's versleuteld opgeslagen`);
      }
    }
  }

  if (mappingWrites.length > 0) {
    await batchUpsert(adminClient, 'bendy_id_mapping', mappingWrites, 'tenant,entity_type,bendy_id');
  }

  (result as any).email_matched = emailMatchCount;
  (result as any).email_skipped_other_bendy = emailSkippedCount;

  logInfo(FUNCTION_NAME, `Professional sync voltooid: ${result.fetched} opgehaald, ${result.created} aangemaakt, ${result.updated} bijgewerkt, ${result.skipped} overgeslagen, ${result.failed} gefaald`);
  return result;
}
