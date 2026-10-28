import 'server-only';

import * as React from 'react';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { BroadsheetDataset, BroadsheetProgrammeSection } from './broadsheet-data';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    paddingTop: 32,
    paddingBottom: 36,
    paddingHorizontal: 28,
    color: '#0F172A',
  },
  headerBanner: {
    marginBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: '#0B2545',
    borderBottomStyle: 'solid',
    paddingBottom: 6,
  },
  titleUniversity: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#0B2545',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  titleDepartment: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#334155',
    textAlign: 'center',
    marginTop: 2,
  },
  titleReport: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0B2545',
    textAlign: 'center',
    marginTop: 3,
  },
  draftBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  draftText: {
    color: '#B91C1C',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  programmeSection: {
    marginTop: 10,
    marginBottom: 16,
  },
  programmeHeader: {
    backgroundColor: '#0B2545',
    color: '#FFFFFF',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 2,
    marginBottom: 4,
  },
  table: {
    width: '100%',
    borderWidth: 0.5,
    borderColor: '#CBD5E1',
    borderStyle: 'solid',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E2E8F0',
    borderBottomStyle: 'solid',
    minHeight: 16,
    alignItems: 'center',
  },
  tableRowEven: {
    backgroundColor: '#F8FAFC',
  },
  tableHeaderRow: {
    backgroundColor: '#1E3A8A',
    minHeight: 18,
    alignItems: 'center',
  },
  tableHeaderCell: {
    color: '#FFFFFF',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    paddingHorizontal: 4,
  },
  colIndex: { width: '15%', textAlign: 'center' },
  colName: { width: '27%', textAlign: 'left' },
  colGroup: { width: '14%', textAlign: 'center' },
  colSupervisor: { width: '11%', textAlign: 'right' },
  colPanel: { width: '11%', textAlign: 'right' },
  colComposite: { width: '11%', textAlign: 'right' },
  colStatus: { width: '11%', textAlign: 'center' },

  tableCell: {
    fontSize: 7.5,
    paddingHorizontal: 4,
  },
  tableCellBold: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 4,
  },
  emptyNotice: {
    paddingVertical: 8,
    textAlign: 'center',
    color: '#64748B',
    fontFamily: 'Helvetica-Oblique',
    fontSize: 8,
  },
  signatureContainer: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
  },
  signatureBox: {
    width: '38%',
    alignItems: 'center',
  },
  signatureRule: {
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#0F172A',
    borderBottomStyle: 'solid',
    marginBottom: 4,
  },
  signatureLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#0B2545',
    textAlign: 'center',
  },
  signatureSub: {
    fontSize: 7,
    color: '#475569',
    textAlign: 'center',
    marginTop: 1,
  },
  pageFooter: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#CBD5E1',
    paddingTop: 4,
  },
  footerText: {
    fontSize: 7,
    color: '#64748B',
  },
});

interface BroadsheetPdfProps {
  dataset: BroadsheetDataset;
}

export function BroadsheetPdfDocument({ dataset }: BroadsheetPdfProps) {
  const isDraft = !dataset.is_all_locked;
  const sections: BroadsheetProgrammeSection[] = dataset.programmes;

  return (
    <Document title={`Department_Broadsheet_${dataset.academic_year_id}`} author="HTU Computer Science">
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Repeating Header */}
        <View fixed style={styles.headerBanner}>
          <Text style={styles.titleUniversity}>Ho Technical University</Text>
          <Text style={styles.titleDepartment}>
            Department of Computer Science · Final Year Capstone Project Management System
          </Text>
          <Text style={styles.titleReport}>
            Official Department Broadsheet — Academic Session {dataset.academic_year_id}
          </Text>

          {isDraft && (
            <View style={styles.draftBanner}>
              <Text style={styles.draftText}>
                *** DRAFT — NOT PUBLISHED (PRE-PUBLICATION GRADES · PENDING OFFICIAL LOCK) ***
              </Text>
            </View>
          )}
        </View>

        {/* Programme Sections */}
        {sections.map((section) => (
          <View key={section.course_id} style={styles.programmeSection}>
            <Text style={styles.programmeHeader}>
              {section.course_name.toUpperCase()} ({section.course_code})
            </Text>

            <View style={styles.table}>
              {/* Header Row */}
              <View style={[styles.tableRow, styles.tableHeaderRow]}>
                <Text style={[styles.tableHeaderCell, styles.colIndex]}>INDEX NO.</Text>
                <Text style={[styles.tableHeaderCell, styles.colName]}>STUDENT FULL NAME</Text>
                <Text style={[styles.tableHeaderCell, styles.colGroup]}>GROUP NO.</Text>
                <Text style={[styles.tableHeaderCell, styles.colSupervisor]}>SUPV (40%)</Text>
                <Text style={[styles.tableHeaderCell, styles.colPanel]}>PANEL (60%)</Text>
                <Text style={[styles.tableHeaderCell, styles.colComposite]}>FINAL (100%)</Text>
                <Text style={[styles.tableHeaderCell, styles.colStatus]}>STATUS</Text>
              </View>

              {/* Data Rows */}
              {section.rows.length === 0 ? (
                <Text style={styles.emptyNotice}>
                  No students or project teams recorded for this programme.
                </Text>
              ) : (
                section.rows.map((student, idx) => (
                  <View
                    key={`${student.group_number}-${student.index_number}-${idx}`}
                    style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowEven : {}]}
                  >
                    <Text style={[styles.tableCell, styles.colIndex]}>{student.index_number}</Text>
                    <Text style={[styles.tableCell, styles.colName]}>{student.full_name}</Text>
                    <Text style={[styles.tableCell, styles.colGroup]}>{student.group_number}</Text>
                    <Text style={[styles.tableCell, styles.colSupervisor]}>
                      {student.supervisor_score !== null && student.supervisor_score !== undefined
                        ? student.supervisor_score.toFixed(2)
                        : '—'}
                    </Text>
                    <Text style={[styles.tableCell, styles.colPanel]}>
                      {student.panel_average_score !== null && student.panel_average_score !== undefined
                        ? student.panel_average_score.toFixed(2)
                        : '—'}
                    </Text>
                    <Text style={[styles.tableCellBold, styles.colComposite]}>
                      {student.composite_final_score !== null &&
                      student.composite_final_score !== undefined
                        ? student.composite_final_score.toFixed(2)
                        : '—'}
                    </Text>
                    <Text style={[styles.tableCell, styles.colStatus]}>
                      {student.is_locked ? 'Locked' : student.is_incomplete ? 'Incomplete' : 'Pending'}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {/* Signature Block per programme */}
            <View style={styles.signatureContainer} wrap={false}>
              <View style={styles.signatureBox}>
                <View style={styles.signatureRule} />
                <Text style={styles.signatureLabel}>Head of Department</Text>
                <Text style={styles.signatureSub}>Department of Computer Science</Text>
                <Text style={styles.signatureSub}>Date: ________________________</Text>
              </View>

              <View style={styles.signatureBox}>
                <View style={styles.signatureRule} />
                <Text style={styles.signatureLabel}>Dean of Faculty</Text>
                <Text style={styles.signatureSub}>Faculty of Applied Sciences & Technology</Text>
                <Text style={styles.signatureSub}>Date: ________________________</Text>
              </View>
            </View>
          </View>
        ))}

        {/* Repeating Footer */}
        <View fixed style={styles.pageFooter}>
          <Text style={styles.footerText}>
            Ho Technical University · Computer Science FYPMS Broadsheet
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/**
 * Generates an official printable PDF buffer using @react-pdf/renderer.
 */
export async function generateBroadsheetPdf(dataset: BroadsheetDataset): Promise<Buffer> {
  const doc = <BroadsheetPdfDocument dataset={dataset} />;
  return await renderToBuffer(doc);
}
