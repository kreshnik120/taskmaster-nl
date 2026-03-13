/**
 * BENDY SYNC — Client sync logic
 */

import { logInfo } from './core.ts';
import {
  FUNCTION_NAME,
  fetchAllBendyRecords,
  deriveOrgName,
  normalizeForMatch,
  buildContactName,
  type SyncResult,
} from './bendy-helpers.ts';

export async function syncClients(
  adminClient: any,
  tenant: string,
  orgId: string,
  _syncType: 'full' | 'incremental'
): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

  logInfo(FUNCTION_NAME, `Ophalen Bendy clients voor ${tenant}...`);
  const { records: bendyClients } = await fetchAllBendyRecords(tenant, '/api/v2/clients');
  result.fetched = bendyClients.length;
  logInfo(FUNCTION_NAME, `${bendyClients.length} Bendy clients opgehaald`);

  const kvkGroups = new Map<string, any[]>();
  const noKvkRecords: any[] = [];

  for (const client of bendyClients) {
    const kvk = (client.attributes?.chamber_of_commerce_number || '').trim();
    if (kvk) {
      if (!kvkGroups.has(kvk)) kvkGroups.set(kvk, []);
      kvkGroups.get(kvk)!.push(client);
    } else {
      noKvkRecords.push(client);
    }
  }

  logInfo(FUNCTION_NAME, `${kvkGroups.size} unieke KvK-nummers, ${noKvkRecords.length} zonder KvK`);

  for (const [kvk, clients] of kvkGroups) {
    try {
      let { data: org } = await adminClient
        .from('client_organizations')
        .select('id, name, bendy_id, website, invoice_bedrijfsnaam, invoice_adres, invoice_postcode, invoice_plaats, crm_fase, afkorting')
        .eq('kvk_nummer', kvk)
        .eq('org_id', orgId)
        .maybeSingle();

      let defaultLocationId: string | null = null;

      if (org) {
        const { data: locations } = await adminClient
          .from('client_locations')
          .select('id')
          .eq('client_org_id', org.id)
          .limit(1);
        defaultLocationId = locations?.[0]?.id || null;

        const firstBendyAttrs = clients[0]?.attributes || {};
        const orgUpdateData: Record<string, any> = {};
        if (firstBendyAttrs.website && !org.website) orgUpdateData.website = firstBendyAttrs.website;
        if (firstBendyAttrs.invoice_company_name && firstBendyAttrs.invoice_company_name !== org.invoice_bedrijfsnaam) orgUpdateData.invoice_bedrijfsnaam = firstBendyAttrs.invoice_company_name;
        if (firstBendyAttrs.invoice_address && firstBendyAttrs.invoice_address !== org.invoice_adres) orgUpdateData.invoice_adres = firstBendyAttrs.invoice_address;
        if (firstBendyAttrs.invoice_zipcode && firstBendyAttrs.invoice_zipcode !== org.invoice_postcode) orgUpdateData.invoice_postcode = firstBendyAttrs.invoice_zipcode;
        if (firstBendyAttrs.invoice_town && firstBendyAttrs.invoice_town !== org.invoice_plaats) orgUpdateData.invoice_plaats = firstBendyAttrs.invoice_town;
        if (firstBendyAttrs.crm_stage && firstBendyAttrs.crm_stage !== org.crm_fase) orgUpdateData.crm_fase = firstBendyAttrs.crm_stage;
        if (firstBendyAttrs.abbreviation && firstBendyAttrs.abbreviation !== org.afkorting) orgUpdateData.afkorting = firstBendyAttrs.abbreviation;
        if (Object.keys(orgUpdateData).length > 0) {
          await adminClient.from('client_organizations').update(orgUpdateData).eq('id', org.id);
        }

        if (!defaultLocationId) {
          const { data: newLoc } = await adminClient
            .from('client_locations')
            .insert({ client_org_id: org.id, naam: 'Hoofdlocatie' })
            .select('id')
            .single();
          defaultLocationId = newLoc?.id || null;
        }
      } else {
        const orgName = deriveOrgName(clients);
        logInfo(FUNCTION_NAME, `Auto-aanmaken organisatie: "${orgName}" (KvK: ${kvk})`);

        const { data: newOrg, error: orgError } = await adminClient
          .from('client_organizations')
          .insert({ org_id: orgId, name: orgName, kvk_nummer: kvk })
          .select('id, name, bendy_id')
          .single();

        if (orgError || !newOrg) {
          result.failed += clients.length;
          result.errors.push(`KvK ${kvk}: Org aanmaken mislukt: ${orgError?.message}`);
          continue;
        }
        org = newOrg;

        const firstAttrs = clients[0]?.attributes || {};
        const { data: newLoc } = await adminClient
          .from('client_locations')
          .insert({
            client_org_id: org.id,
            naam: 'Hoofdlocatie',
            adres: firstAttrs.address || null,
            postcode: firstAttrs.zipcode || null,
            plaats: firstAttrs.town || null,
          })
          .select('id')
          .single();
        defaultLocationId = newLoc?.id || null;
      }

      await adminClient
        .from('bendy_id_mapping')
        .upsert({
          org_id: orgId, tenant, entity_type: 'organization',
          bendy_id: `kvk-${kvk}`, local_id: org.id,
          last_synced_at: new Date().toISOString(), sync_status: 'synced',
        }, { onConflict: 'tenant,entity_type,bendy_id' });

      const { data: allLocations } = await adminClient
        .from('client_locations')
        .select('id')
        .eq('client_org_id', org.id);

      const locationIds = (allLocations || []).map((l: any) => l.id);
      let existingSubs: any[] = [];
      if (locationIds.length > 0) {
        const { data: subs } = await adminClient
          .from('client_sublocations')
          .select('id, naam, adres, postcode, plaats, kostenplaats, telefoon, email, contactpersoon_naam, is_active, bendy_id, location_id, publieke_opmerking, interne_opmerking, externe_referentie, bendy_parent_id, kleur')
          .in('location_id', locationIds);
        existingSubs = subs || [];
      }

      for (const bendyClient of clients) {
        try {
          const bendyId = String(bendyClient.id);
          const attrs = bendyClient.attributes || {};

          await adminClient
            .from('bendy_raw_cache')
            .upsert({
              org_id: orgId, tenant, entity_type: 'clients',
              bendy_id: bendyId, raw_data: bendyClient,
              fetched_at: new Date().toISOString(),
            }, { onConflict: 'tenant,entity_type,bendy_id' });

          let matchedSub: any = null;

          matchedSub = existingSubs.find((s: any) => s.bendy_id === bendyId);

          if (!matchedSub && attrs.company_name) {
            const bendyNorm = normalizeForMatch(attrs.company_name);
            matchedSub = existingSubs.find((s: any) =>
              !s.bendy_id && normalizeForMatch(s.naam || '') === bendyNorm
            );
          }

          if (!matchedSub && attrs.zipcode && attrs.address) {
            const bendyPostcode = attrs.zipcode.replace(/\s/g, '').toUpperCase();
            const bendyAdres = normalizeForMatch(attrs.address);
            matchedSub = existingSubs.find((s: any) =>
              !s.bendy_id && s.postcode && s.postcode.replace(/\s/g, '').toUpperCase() === bendyPostcode
              && s.adres && normalizeForMatch(s.adres) === bendyAdres
            );
          }

          if (!matchedSub && attrs.company_name) {
            const bendyNorm = normalizeForMatch(attrs.company_name);
            matchedSub = existingSubs.find((s: any) => {
              if (s.bendy_id) return false;
              const localNorm = normalizeForMatch(s.naam || '');
              if (localNorm.length < 8 && bendyNorm.length < 8) return false;
              return bendyNorm.includes(localNorm) || localNorm.includes(bendyNorm);
            });
          }

          if (matchedSub) {
            const updateData: Record<string, any> = { bendy_id: bendyId };
            if (attrs.company_name && attrs.company_name !== matchedSub.naam) updateData.naam = attrs.company_name;
            if (attrs.address && attrs.address !== matchedSub.adres) updateData.adres = attrs.address;
            if (attrs.zipcode && attrs.zipcode !== matchedSub.postcode) updateData.postcode = attrs.zipcode;
            if (attrs.town && attrs.town !== matchedSub.plaats) updateData.plaats = attrs.town;
            const effectivePhone = attrs.telephone || attrs.mobile || null;
            if (effectivePhone && effectivePhone !== matchedSub.telefoon) updateData.telefoon = effectivePhone;
            if (attrs.email && attrs.email !== matchedSub.email) updateData.email = attrs.email;
            const contactName = buildContactName(attrs);
            if (contactName && contactName !== matchedSub.contactpersoon_naam) updateData.contactpersoon_naam = contactName;
            if (attrs.status) {
              const bendyActive = attrs.status.toLowerCase() !== 'inactive';
              if (bendyActive !== matchedSub.is_active) updateData.is_active = bendyActive;
            }
            if (attrs.comment_public && attrs.comment_public !== matchedSub.publieke_opmerking) updateData.publieke_opmerking = attrs.comment_public;
            if (attrs.comment && attrs.comment !== matchedSub.interne_opmerking) updateData.interne_opmerking = attrs.comment;
            if (attrs.external_id && attrs.external_id !== matchedSub.externe_referentie) updateData.externe_referentie = String(attrs.external_id);
            if (attrs.parent_id && String(attrs.parent_id) !== matchedSub.bendy_parent_id) updateData.bendy_parent_id = String(attrs.parent_id);
            if (attrs.color && attrs.color !== matchedSub.kleur) updateData.kleur = attrs.color;

            await adminClient.from('client_sublocations').update(updateData).eq('id', matchedSub.id);
            matchedSub.bendy_id = bendyId;

            await adminClient
              .from('bendy_id_mapping')
              .upsert({
                org_id: orgId, tenant, entity_type: 'sublocation',
                bendy_id: bendyId, local_id: matchedSub.id,
                bendy_updated_at: attrs.updated_at || null,
                last_synced_at: new Date().toISOString(),
                sync_status: 'synced', conflict_data: null,
              }, { onConflict: 'tenant,entity_type,bendy_id' });

            result.updated++;
          } else if (defaultLocationId) {
            const newContactName = buildContactName(attrs);
            const { data: newSub, error: subError } = await adminClient
              .from('client_sublocations')
              .insert({
                location_id: defaultLocationId,
                naam: attrs.company_name || `Bendy ${bendyId}`,
                adres: attrs.address || null, postcode: attrs.zipcode || null,
                plaats: attrs.town || null,
                telefoon: attrs.telephone || attrs.mobile || null,
                email: attrs.email || null, contactpersoon_naam: newContactName,
                publieke_opmerking: attrs.comment_public || null,
                interne_opmerking: attrs.comment || null,
                externe_referentie: attrs.external_id ? String(attrs.external_id) : null,
                bendy_parent_id: attrs.parent_id ? String(attrs.parent_id) : null,
                kleur: attrs.color || null, bendy_id: bendyId,
              })
              .select('id, naam, bendy_id')
              .single();

            if (newSub) {
              existingSubs.push(newSub);
              await adminClient
                .from('bendy_id_mapping')
                .upsert({
                  org_id: orgId, tenant, entity_type: 'sublocation',
                  bendy_id: bendyId, local_id: newSub.id,
                  bendy_updated_at: attrs.updated_at || null,
                  last_synced_at: new Date().toISOString(), sync_status: 'synced',
                }, { onConflict: 'tenant,entity_type,bendy_id' });
              result.created++;
            } else {
              result.failed++;
              result.errors.push(`Sublocation ${bendyId}: ${subError?.message || 'Aanmaken mislukt'}`);
            }
          } else {
            await adminClient
              .from('bendy_id_mapping')
              .upsert({
                org_id: orgId, tenant, entity_type: 'sublocation',
                bendy_id: bendyId, local_id: '00000000-0000-0000-0000-000000000000',
                last_synced_at: new Date().toISOString(), sync_status: 'pending',
                conflict_data: { company_name: attrs.company_name, kvk: kvk, town: attrs.town },
              }, { onConflict: 'tenant,entity_type,bendy_id' });
            result.skipped++;
          }
        } catch (error) {
          result.failed++;
          const msg = error instanceof Error ? error.message : String(error);
          result.errors.push(`Client ${bendyClient.id}: ${msg.substring(0, 200)}`);
          if (result.errors.length > 20) break;
        }
      }
    } catch (error) {
      result.failed += clients.length;
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`KvK ${kvk}: ${msg.substring(0, 200)}`);
    }
  }

  for (const bendyClient of noKvkRecords) {
    try {
      const bendyId = String(bendyClient.id);
      const attrs = bendyClient.attributes || {};

      await adminClient
        .from('bendy_raw_cache')
        .upsert({
          org_id: orgId, tenant, entity_type: 'clients',
          bendy_id: bendyId, raw_data: bendyClient,
          fetched_at: new Date().toISOString(),
        }, { onConflict: 'tenant,entity_type,bendy_id' });

      await adminClient
        .from('bendy_id_mapping')
        .upsert({
          org_id: orgId, tenant, entity_type: 'sublocation',
          bendy_id: bendyId, local_id: '00000000-0000-0000-0000-000000000000',
          last_synced_at: new Date().toISOString(), sync_status: 'pending',
          conflict_data: { company_name: attrs.company_name, kvk: null, town: attrs.town },
        }, { onConflict: 'tenant,entity_type,bendy_id' });

      result.skipped++;
    } catch (error) {
      result.failed++;
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Client (no KvK) ${bendyClient.id}: ${msg.substring(0, 200)}`);
    }
  }

  return result;
}
