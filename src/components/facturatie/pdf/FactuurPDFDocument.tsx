import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { FactuurWithDetails, FacturatieInstellingen, FactuurStatus } from '@/types/facturatie';

// Register fonts for better typography
Font.register({
  family: 'Inter',
  fonts: [
    { 
      src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff2',
      fontWeight: 400,
    },
    { 
      src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hjp-Ek-_EeA.woff2', 
      fontWeight: 600,
    },
    { 
      src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hjp-Ek-_EeA.woff2', 
      fontWeight: 700,
    },
  ],
});

// Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Inter',
    color: '#1f2937',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  companyInfo: {
    textAlign: 'right',
  },
  companyName: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4,
  },
  companyDetail: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#111827',
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  infoBlock: {
    width: '45%',
  },
  infoLabel: {
    fontSize: 8,
    color: '#9ca3af',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 10,
    marginBottom: 2,
  },
  infoValueBold: {
    fontSize: 10,
    fontWeight: 600,
    marginBottom: 2,
  },
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableHeaderText: {
    fontWeight: 600,
    fontSize: 9,
    color: '#374151',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  tableRowAlt: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#fafafa',
  },
  colDescription: { width: '40%' },
  colQuantity: { width: '12%', textAlign: 'right' },
  colUnit: { width: '12%', textAlign: 'center' },
  colPrice: { width: '18%', textAlign: 'right' },
  colTotal: { width: '18%', textAlign: 'right' },
  totalsSection: {
    marginLeft: 'auto',
    width: 200,
    marginTop: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalRowFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 2,
    borderTopColor: '#111827',
    marginTop: 4,
  },
  totalLabel: {
    color: '#6b7280',
  },
  totalValue: {
    fontWeight: 600,
  },
  totalFinalLabel: {
    fontSize: 12,
    fontWeight: 700,
  },
  totalFinalValue: {
    fontSize: 12,
    fontWeight: 700,
  },
  paymentSection: {
    marginTop: 30,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
  },
  paymentTitle: {
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 8,
  },
  paymentDetail: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  paymentLabel: {
    width: 100,
    color: '#6b7280',
    fontSize: 9,
  },
  paymentValue: {
    fontSize: 9,
    fontWeight: 600,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
  },
  footerText: {
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
  },
  statusConcept: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
  },
  statusVerzonden: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
  },
  statusBetaald: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
  },
  statusHerinnering: {
    backgroundColor: '#fef3c7',
    color: '#d97706',
  },
  statusBetwist: {
    backgroundColor: '#f3e8ff',
    color: '#7c3aed',
  },
});

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

// Status labels
const STATUS_LABELS: Record<FactuurStatus, string> = {
  CONCEPT: 'Concept',
  DEFINITIEF: 'Definitief',
  VERZONDEN: 'Verzonden',
  HERINNERING_1: 'Herinnering 1',
  HERINNERING_2: 'Herinnering 2',
  HERINNERING_3: 'Herinnering 3',
  BETWIST: 'Betwist',
  BETAALD: 'Betaald',
  AFGEBOEKT: 'Afgeboekt',
};

interface FactuurPDFDocumentProps {
  factuur: FactuurWithDetails;
  instellingen: FacturatieInstellingen | null;
}

export function FactuurPDFDocument({ factuur, instellingen }: FactuurPDFDocumentProps) {
  // Determine status style
  const getStatusStyle = () => {
    switch (factuur.status) {
      case 'BETAALD':
        return styles.statusBetaald;
      case 'VERZONDEN':
      case 'DEFINITIEF':
        return styles.statusVerzonden;
      case 'HERINNERING_1':
      case 'HERINNERING_2':
      case 'HERINNERING_3':
        return styles.statusHerinnering;
      case 'BETWIST':
        return styles.statusBetwist;
      default:
        return styles.statusConcept;
    }
  };

  // Calculate payment term in days
  const betalingstermijn = Math.ceil(
    (new Date(factuur.vervaldatum).getTime() - new Date(factuur.factuurdatum).getTime()) / 
    (1000 * 60 * 60 * 24)
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>
              {instellingen?.bedrijfsnaam || 'Uw Bedrijf'}
            </Text>
          </View>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>
              {instellingen?.bedrijfsnaam || 'Uw Bedrijf'}
            </Text>
            {instellingen?.adres_straat && (
              <Text style={styles.companyDetail}>{instellingen.adres_straat}</Text>
            )}
            {instellingen?.adres_postcode && instellingen?.adres_plaats && (
              <Text style={styles.companyDetail}>
                {instellingen.adres_postcode} {instellingen.adres_plaats}
              </Text>
            )}
            {instellingen?.kvk_nummer && (
              <Text style={styles.companyDetail}>KvK: {instellingen.kvk_nummer}</Text>
            )}
            {instellingen?.btw_nummer && (
              <Text style={styles.companyDetail}>BTW: {instellingen.btw_nummer}</Text>
            )}
          </View>
        </View>

        {/* Title with Status Badge */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>
            {factuur.type === 'CREDIT' ? 'Creditnota' : 'Factuur'}
          </Text>
          <View style={[styles.statusBadge, getStatusStyle()]}>
            <Text>{STATUS_LABELS[factuur.status]}</Text>
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          {/* Left: Client info */}
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Factuuradres</Text>
            <Text style={styles.infoValueBold}>
              {factuur.opdrachtgever?.name || 'Onbekend'}
            </Text>
            {factuur.opdrachtgever?.kvk_nummer && (
              <Text style={styles.infoValue}>KvK: {factuur.opdrachtgever.kvk_nummer}</Text>
            )}
            {factuur.opdrachtgever?.btw_nummer && (
              <Text style={styles.infoValue}>BTW: {factuur.opdrachtgever.btw_nummer}</Text>
            )}
          </View>

          {/* Right: Invoice details */}
          <View style={styles.infoBlock}>
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.infoLabel}>Factuurnummer</Text>
              <Text style={styles.infoValueBold}>{factuur.factuur_nummer}</Text>
            </View>
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.infoLabel}>Factuurdatum</Text>
              <Text style={styles.infoValue}>
                {format(new Date(factuur.factuurdatum), 'd MMMM yyyy', { locale: nl })}
              </Text>
            </View>
            <View>
              <Text style={styles.infoLabel}>Vervaldatum</Text>
              <Text style={styles.infoValue}>
                {format(new Date(factuur.vervaldatum), 'd MMMM yyyy', { locale: nl })}
              </Text>
            </View>
            {factuur.referentie && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.infoLabel}>Referentie</Text>
                <Text style={styles.infoValue}>{factuur.referentie}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colDescription]}>Omschrijving</Text>
            <Text style={[styles.tableHeaderText, styles.colQuantity]}>Aantal</Text>
            <Text style={[styles.tableHeaderText, styles.colUnit]}>Eenheid</Text>
            <Text style={[styles.tableHeaderText, styles.colPrice]}>Prijs</Text>
            <Text style={[styles.tableHeaderText, styles.colTotal]}>Totaal</Text>
          </View>

          {/* Table Rows */}
          {factuur.regels.map((regel, index) => (
            <View key={regel.id} style={index % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={styles.colDescription}>{regel.omschrijving}</Text>
              <Text style={styles.colQuantity}>{regel.aantal}</Text>
              <Text style={styles.colUnit}>{regel.eenheid}</Text>
              <Text style={styles.colPrice}>{formatCurrency(regel.prijs)}</Text>
              <Text style={styles.colTotal}>{formatCurrency(regel.subtotaal)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotaal</Text>
            <Text style={styles.totalValue}>{formatCurrency(factuur.subtotaal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>BTW ({factuur.btw_percentage}%)</Text>
            <Text style={styles.totalValue}>{formatCurrency(factuur.btw_bedrag)}</Text>
          </View>
          <View style={styles.totalRowFinal}>
            <Text style={styles.totalFinalLabel}>Totaal</Text>
            <Text style={styles.totalFinalValue}>{formatCurrency(factuur.totaal)}</Text>
          </View>
        </View>

        {/* Payment Section */}
        <View style={styles.paymentSection}>
          <Text style={styles.paymentTitle}>Betalingsgegevens</Text>
          {instellingen?.iban && (
            <View style={styles.paymentDetail}>
              <Text style={styles.paymentLabel}>IBAN</Text>
              <Text style={styles.paymentValue}>{instellingen.iban}</Text>
            </View>
          )}
          {instellingen?.bic && (
            <View style={styles.paymentDetail}>
              <Text style={styles.paymentLabel}>BIC</Text>
              <Text style={styles.paymentValue}>{instellingen.bic}</Text>
            </View>
          )}
          <View style={styles.paymentDetail}>
            <Text style={styles.paymentLabel}>Betalingskenmerk</Text>
            <Text style={styles.paymentValue}>{factuur.factuur_nummer}</Text>
          </View>
          <View style={styles.paymentDetail}>
            <Text style={styles.paymentLabel}>Betalingstermijn</Text>
            <Text style={styles.paymentValue}>{betalingstermijn} dagen</Text>
          </View>
          {instellingen?.betalingsinstructies && (
            <Text style={{ marginTop: 8, fontSize: 9, color: '#6b7280' }}>
              {instellingen.betalingsinstructies}
            </Text>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          {instellingen?.factuur_footer_tekst && (
            <Text style={styles.footerText}>{instellingen.factuur_footer_tekst}</Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
