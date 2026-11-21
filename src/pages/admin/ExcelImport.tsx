import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { collection, query, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Exam, Result, Student } from '../../types';
import {
  BOOK_NAME_SUGGESTIONS,
  BookMappingsStore,
  isGenericSubjectName,
  isNonSubjectColumn,
  loadBookMappings,
  normalizeClassKey,
  saveBookMappings,
  sortSubjectNames,
} from '../../lib/subjectBookMappings';

interface SheetData {
  headers: string[];
  rows: any[];
  sheetSummary: { name: string; rowCount: number; status: string }[];
}

const IGNORE_SUBJECT_COLS = new Set([
  'sr', 'sr.', 'sr no', 'sr. no', 'sr#', 's.no', 's no', 's#', 'sno', 'serial', 'serial no',
  'phone', 'mobile', 'contact', 'cell', 'cnic', 'b-form', 'bform', 'dob', 'date of birth',
  'address', 'gender', 'sex', 'status', 'remarks', 'position', 'grade', 'percentage', '%',
  'total', 'grand', 'grand total', 'grand obtained', 'total marks', 'obtained', 'obtained marks', 'obt', 'obt marks',
  'overall', 'discipline', 'result', 'result status', 'pass/fail'
]);

const isTotalSubHeader = (val: string) => {
  const s = val.toLowerCase().trim();
  return s === 'total' || s === 'total marks' || s === 'max' || s === 'max marks' || s === 't.marks' || s === 't marks';
};

const isObtainedSubHeader = (val: string) => {
  const s = val.toLowerCase().trim();
  return s === 'obtained' || s === 'obtained marks' || s === 'obt' || s === 'obt.' || s === 'obt marks' || s === 'o.marks' || s === 'o marks';
};

const safeStr = (val: any, maxLen: number): string => {
  if (val === null || val === undefined) return '';
  return String(val).trim().slice(0, maxLen);
};

const safeNum = (val: any): number => {
  if (val === '' || val === null || val === undefined) return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
};

export default function ExcelImport() {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');

  const defaultMapping: Record<string, string> = {
    studentId: '',
    rollNumber: '',
    studentName: '',
    fatherName: '',
    className: '',
    section: '',
    totalMarks: '',
    obtainedMarks: '',
    percentage: '',
    grade: '',
    resultStatus: '',
    position: '',
    attendance: '',
    discipline: '',
    remarks: '',
  };

  // Mapping state
  const [mapping, setMapping] = useState<Record<string, string>>(defaultMapping);
  const [bookMappings, setBookMappings] = useState<BookMappingsStore>(() => loadBookMappings());
  const [selectedBookClass, setSelectedBookClass] = useState<string>('');

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    new: number;
    updated: number;
    errors: number;
    errorDetails: string[];
  } | null>(null);

  useEffect(() => {
    const fetchExams = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'exams')));
        setExams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Exam)));
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'exams');
      }
    };
    fetchExams();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setImportResult(null);

    const data = await uploadedFile.arrayBuffer();
    const workbook = XLSX.read(data);
    setSheets(workbook.SheetNames);

    let allRows: any[] = [];
    const commonHeaders = new Set<string>();
    const sheetSummary: { name: string; rowCount: number; status: string }[] = [];
    const detectedExcelBookMappings: BookMappingsStore = {};

    for (const sheetName of workbook.SheetNames) {
      const lowerSheet = sheetName.toLowerCase().trim();
      const ws = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });

      if (rawData.length < 2) {
        sheetSummary.push({ name: sheetName, rowCount: 0, status: 'Skipped (empty sheet)' });
        continue;
      }

      // Check if this sheet is a Class -> Subject Book Names lookup sheet
      let lookupHeaderIdx = -1;
      for (let i = 0; i < Math.min(15, rawData.length); i++) {
        const rowStr = rawData[i].map((c: any) => String(c ?? '').toLowerCase().trim()).join(' | ');
        const hasClassCol = rowStr.includes('class');
        const hasSubjectCol = /subject\s*1\b/i.test(rowStr);
        const hasRoll = rowStr.includes('roll');
        if (hasClassCol && hasSubjectCol && !hasRoll) {
          lookupHeaderIdx = i;
          break;
        }
      }
      if (lookupHeaderIdx !== -1) {
        const lHeaders = rawData[lookupHeaderIdx].map((c: any) => String(c ?? '').trim());
        const classColIdx = lHeaders.findIndex(h => h.toLowerCase().includes('class'));
        let mappedClassRows = 0;
        if (classColIdx !== -1) {
          for (let r = lookupHeaderIdx + 1; r < rawData.length; r++) {
            const clsVal = String(rawData[r][classColIdx] ?? '').trim();
            if (!clsVal) continue;
            const clsKey = normalizeClassKey(clsVal);
            if (!detectedExcelBookMappings[clsKey]) detectedExcelBookMappings[clsKey] = {};
            let foundText = false;
            lHeaders.forEach((h, idx) => {
              if (idx === classColIdx || !h) return;
              const cellVal = String(rawData[r][idx] ?? '').trim();
              if (cellVal && isNaN(Number(cellVal))) {
                detectedExcelBookMappings[clsKey][h] = cellVal;
                foundText = true;
              }
            });
            if (foundText) mappedClassRows++;
          }
        }
        if (mappedClassRows > 0) {
          sheetSummary.push({
            name: sheetName,
            rowCount: mappedClassRows,
            status: `Book Names Lookup (${mappedClassRows} classes)`,
          });
          continue;
        }
      }

      // Skip single-card template tabs and settings tabs if there are other sheets
      if (
        workbook.SheetNames.length > 1 &&
        (
          lowerSheet.includes('result card') ||
          lowerSheet.includes('result sheet') ||
          lowerSheet === 'card' ||
          lowerSheet === 'template' ||
          lowerSheet === 'settings'
        )
      ) {
        sheetSummary.push({ name: sheetName, rowCount: 0, status: 'Skipped (template / settings sheet)' });
        continue;
      }

      // Find the main header row (scan up to 30 rows)
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(30, rawData.length); i++) {
        const nonEmptyCells = rawData[i].filter((c: any) => String(c ?? '').trim() !== '');
        if (nonEmptyCells.length < 2) continue;

        const rowString = rawData[i].map((c: any) => String(c ?? '').toLowerCase()).join(' | ');
        const hasName = rowString.includes('name') || rowString.includes('student');
        const hasIdOrRoll =
          rowString.includes('roll') ||
          rowString.includes('class id') ||
          rowString.includes('classid') ||
          rowString.includes('class_id') ||
          rowString.includes('student id') ||
          rowString.includes('studentid') ||
          rowString.includes('std id') ||
          rowString.includes('reg') ||
          rowString.includes('adm') ||
          /\bid\b/.test(rowString);

        if ((hasName && hasIdOrRoll) || (nonEmptyCells.length >= 4 && hasIdOrRoll)) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        sheetSummary.push({ name: sheetName, rowCount: 0, status: 'Skipped (no student table headers found)' });
        continue;
      }

      // Detect fallback class name from sheet title or metadata rows above header
      let fallbackClass = '';
      for (let i = 0; i < headerRowIndex; i++) {
        const line = rawData[i].map((c: any) => String(c ?? '').trim()).filter(Boolean);
        for (let j = 0; j < line.length; j++) {
          const cellLower = line[j].toLowerCase();
          if ((cellLower === 'class' || cellLower === 'class:' || cellLower.includes('class id')) && line[j + 1]) {
            fallbackClass = line[j + 1];
            break;
          }
        }
        if (fallbackClass) break;
      }
      if (
        !fallbackClass &&
        !lowerSheet.includes('data') &&
        !lowerSheet.includes('sheet') &&
        !lowerSheet.includes('all') &&
        !lowerSheet.includes('master') &&
        !lowerSheet.includes('result')
      ) {
        fallbackClass = sheetName.trim();
      }

      const topHeaders = rawData[headerRowIndex] || [];
      const potentialSubHeaders = rawData[headerRowIndex + 1] || [];

      // Check whether row headerRowIndex + 1 is actually a subheader row (Total / Obtained)
      const isTwoRowHeader = potentialSubHeaders.some((cell: any) => {
        const s = String(cell ?? '').trim();
        return isTotalSubHeader(s) || isObtainedSubHeader(s);
      });

      const colCount = Math.max(topHeaders.length, isTwoRowHeader ? potentialSubHeaders.length : 0);
      const flatHeaders: string[] = [];
      let currentSubject = '';

      for (let i = 0; i < colCount; i++) {
        const th = String(topHeaders[i] ?? '').trim();
        const sh = isTwoRowHeader ? String(potentialSubHeaders[i] ?? '').trim() : '';

        if (th && th !== currentSubject) {
          currentSubject = th;
        }

        let headerName = '';
        if (isTwoRowHeader && (isTotalSubHeader(sh) || isObtainedSubHeader(sh))) {
          const normalizedSub = isTotalSubHeader(sh) ? 'Total' : 'Obtained';
          headerName = currentSubject ? `${currentSubject} ${normalizedSub}` : sh;
        } else if (th && sh && th.toLowerCase() !== sh.toLowerCase()) {
          headerName = `${th} ${sh}`;
        } else {
          headerName = th || sh || `Column ${i}`;
        }

        // Avoid overwriting duplicate column names on the same sheet
        let uniqueName = headerName;
        let suffix = 2;
        while (flatHeaders.includes(uniqueName)) {
          uniqueName = `${headerName} (${suffix++})`;
        }

        flatHeaders[i] = uniqueName;
        commonHeaders.add(uniqueName);
      }

      if (fallbackClass && !flatHeaders.some(h => h.toLowerCase() === 'class' || h.toLowerCase() === 'class name')) {
        commonHeaders.add('Detected Sheet Class');
      }

      const dataStartRow = isTwoRowHeader ? headerRowIndex + 2 : headerRowIndex + 1;
      const rollFound = flatHeaders.find(h => h.toLowerCase().includes('roll'));
      const idFound = flatHeaders.find(h => {
        const l = h.toLowerCase();
        return (
          (l.includes('id') && (l.includes('class') || l.includes('student') || l.includes('std'))) ||
          l === 'id' ||
          l.includes('reg') ||
          l.includes('adm')
        );
      });
      const nameFound = flatHeaders.find(h => {
        const l = h.toLowerCase();
        return l.includes('name') && !l.includes('father') && !l.includes('class') && !l.includes('school');
      });

      let sheetRowCount = 0;
      for (let i = dataStartRow; i < rawData.length; i++) {
        const rowArr = rawData[i];
        if (!rowArr || rowArr.every((val: any) => val === '' || val === null || val === undefined)) continue;

        const rowObj: any = {};
        flatHeaders.forEach((h, index) => {
          rowObj[h] = rowArr[index];
        });

        if (fallbackClass && !rowObj['Detected Sheet Class']) {
          rowObj['Detected Sheet Class'] = fallbackClass;
        }

        const hasRoll = rollFound && String(rowObj[rollFound] ?? '').trim() !== '';
        const hasId = idFound && String(rowObj[idFound] ?? '').trim() !== '';
        const hasName = nameFound && String(rowObj[nameFound] ?? '').trim() !== '';

        // Skip summary/footer rows like "Grand Total" or "Average"
        const nameStr = hasName ? String(rowObj[nameFound!]).trim().toLowerCase() : '';
        if (nameStr === 'total' || nameStr === 'grand total' || nameStr === 'average') continue;

        if (hasRoll || hasId || hasName) {
          allRows.push(rowObj);
          sheetRowCount++;
        }
      }

      sheetSummary.push({
        name: sheetName,
        rowCount: sheetRowCount,
        status: sheetRowCount > 0 ? `Parsed (${isTwoRowHeader ? '2-row' : '1-row'} header)` : 'No student rows found',
      });
    }

    const finalHeaders = Array.from(commonHeaders);

    // Determine whether a "Class ID" column holds unique student IDs OR repeated class names (e.g. "9th Arts")
    const classIdCol = finalHeaders.find(h => {
      const l = h.toLowerCase().replace(/[_\s]+/g, '');
      return l === 'classid';
    });
    const nameKey = finalHeaders.find(h => {
      const l = h.toLowerCase();
      return l.includes('name') && !l.includes('father') && !l.includes('class') && !l.includes('school');
    });
    const rollKey = finalHeaders.find(h => h.toLowerCase().includes('roll'));
    const explicitStudentIdKey = finalHeaders.find(h => {
      const l = h.toLowerCase();
      return l === 'student id' || l === 'studentid' || l === 'std id' || l === 'id' || l.includes('reg') || l.includes('adm');
    });
    const explicitClassCol = finalHeaders.find(h => {
      const l = h.toLowerCase();
      return l === 'class' || l === 'class name' || l === 'grade/class' || l === 'detected sheet class';
    });

    let classIdIsGroupClass = false;
    if (classIdCol && nameKey) {
      const namesByClassId = new Map<string, Set<string>>();
      for (const r of allRows) {
        const cid = String(r[classIdCol] ?? '').trim();
        const nm = String(r[nameKey] ?? '').trim().toLowerCase();
        if (cid && nm) {
          if (!namesByClassId.has(cid)) namesByClassId.set(cid, new Set());
          namesByClassId.get(cid)!.add(nm);
        }
      }
      for (const names of namesByClassId.values()) {
        if (names.size > 1) {
          classIdIsGroupClass = true;
          break;
        }
      }
    }

    // Deduplicate safely WITHOUT collapsing different students who share a class name or roll number across classes
    const uniqueRowsMap = new Map<string, any>();
    allRows.forEach((row, idx) => {
      const stuIdVal = explicitStudentIdKey ? String(row[explicitStudentIdKey] ?? '').trim() : '';
      const classIdVal = classIdCol ? String(row[classIdCol] ?? '').trim() : '';
      const rollVal = rollKey ? String(row[rollKey] ?? '').trim() : '';
      const nameVal = nameKey ? String(row[nameKey] ?? '').trim().toLowerCase() : '';
      const classVal = explicitClassCol
        ? String(row[explicitClassCol] ?? '').trim().toLowerCase()
        : classIdIsGroupClass
          ? classIdVal.toLowerCase()
          : '';

      let dedupKey = '';
      if (stuIdVal) {
        dedupKey = `sid:${stuIdVal}|nm:${nameVal}`;
      } else if (classIdVal && !classIdIsGroupClass) {
        dedupKey = `cid:${classIdVal}|nm:${nameVal}`;
      } else if (nameVal && rollVal) {
        dedupKey = `cls:${classVal}|roll:${rollVal}|nm:${nameVal}`;
      } else if (nameVal) {
        dedupKey = `cls:${classVal}|nm:${nameVal}`;
      } else {
        dedupKey = `row:${idx}`;
      }

      if (!uniqueRowsMap.has(dedupKey)) {
        uniqueRowsMap.set(dedupKey, { ...row });
      } else {
        const existingRow = uniqueRowsMap.get(dedupKey);
        for (const key of Object.keys(row)) {
          const val = row[key];
          if (val !== '' && val !== null && val !== undefined) {
            existingRow[key] = val;
          }
        }
      }
    });

    const uniqueRows = Array.from(uniqueRowsMap.values());

    if (uniqueRows.length > 0) {
      setSheetData({ headers: finalHeaders, rows: uniqueRows, sheetSummary });

      const newMapping: Record<string, string> = { ...defaultMapping };
      finalHeaders.forEach(h => {
        const lower = h.toLowerCase().trim();
        const compact = lower.replace(/[_\s]+/g, '');

        if (compact === 'studentid' || compact === 'stdid' || lower === 'id' || lower.includes('reg no') || lower.includes('adm no')) {
          newMapping.studentId = h;
        } else if (compact === 'classid') {
          if (classIdIsGroupClass) {
            if (!newMapping.className) newMapping.className = h;
          } else {
            if (!newMapping.studentId) newMapping.studentId = h;
          }
        } else if (lower.includes('roll')) {
          if (!newMapping.rollNumber) newMapping.rollNumber = h;
        } else if (lower.includes('father')) {
          if (!newMapping.fatherName) newMapping.fatherName = h;
        } else if (lower.includes('name') && !lower.includes('father') && !lower.includes('class') && !lower.includes('school')) {
          if (!newMapping.studentName) newMapping.studentName = h;
        } else if (lower === 'class' || lower === 'class name' || lower === 'grade/class') {
          newMapping.className = h;
        } else if (lower === 'detected sheet class' && !newMapping.className) {
          newMapping.className = h;
        } else if (lower.includes('section')) {
          if (!newMapping.section) newMapping.section = h;
        } else if ((lower === 'total marks' || lower === 'grand total' || lower === 'grand total total') && !newMapping.totalMarks) {
          newMapping.totalMarks = h;
        } else if ((lower === 'obtained marks' || lower === 'grand total obtained' || lower === 'grand obtained') && !newMapping.obtainedMarks) {
          newMapping.obtainedMarks = h;
        } else if ((lower === 'percentage' || lower === 'overall percentage' || lower === '%') && !newMapping.percentage) {
          newMapping.percentage = h;
        } else if ((lower === 'grade' || lower === 'overall grade') && !newMapping.grade) {
          newMapping.grade = h;
        } else if ((lower === 'result' || lower === 'result status' || lower === 'status') && !newMapping.resultStatus) {
          newMapping.resultStatus = h;
        } else if (lower.includes('position') && !newMapping.position) {
          newMapping.position = h;
        } else if (lower === 'attendance' && !newMapping.attendance) {
          newMapping.attendance = h;
        } else if (lower === 'discipline' && !newMapping.discipline) {
          newMapping.discipline = h;
        } else if (lower.includes('remark') && !newMapping.remarks) {
          newMapping.remarks = h;
        }
      });

      // Fallback if Roll Number or Student ID was mapped to only one of them
      if (!newMapping.studentId && newMapping.rollNumber) {
        newMapping.studentId = '';
      }

      setMapping(newMapping);

      // Merge any Excel-detected book mappings with saved localStorage mappings
      if (Object.keys(detectedExcelBookMappings).length > 0) {
        setBookMappings(prev => {
          const merged: BookMappingsStore = { ...prev };
          for (const [clsKey, mapObj] of Object.entries(detectedExcelBookMappings)) {
            merged[clsKey] = { ...(merged[clsKey] || {}), ...mapObj };
          }
          saveBookMappings(merged);
          return merged;
        });
      }
    } else {
      setSheetData({ headers: finalHeaders, rows: [], sheetSummary });
      setMapping(defaultMapping);
    }
  };

  // Detect classes & subject columns per class for Book Name Mapping
  const detectedClassesAndSubjects = useMemo(() => {
    if (!sheetData || sheetData.rows.length === 0) {
      return { classes: [] as string[], subjectsByClass: {} as Record<string, { name: string; totalSample: number }[]>, hasGenericSubjects: false };
    }

    const mappedKeys = new Set(Object.values(mapping).filter(Boolean));
    const classNamesSet = new Set<string>();
    const subsMap: Record<string, Map<string, number>> = {};

    const extractRowSubs = (row: any) => {
      const found = new Map<string, number>();
      for (const key of Object.keys(row)) {
        if (mappedKeys.has(key) || key === 'Detected Sheet Class') continue;
        const lowerKey = key.toLowerCase().trim();
        if (lowerKey.endsWith(' total') || lowerKey.endsWith(' obtained')) {
          const subName = key.substring(0, key.lastIndexOf(' ')).trim();
          if (!subName || IGNORE_SUBJECT_COLS.has(subName.toLowerCase()) || isNonSubjectColumn(subName)) continue;
          const val = row[key];
          if (val !== '' && val !== null && val !== undefined && Number.isFinite(Number(val))) {
            if (lowerKey.endsWith(' total')) {
              found.set(subName, Number(val));
            } else if (!found.has(subName)) {
              found.set(subName, 100);
            }
          }
        }
      }
      // Only check single-column subjects if no paired Total/Obtained subject columns exist on this row
      if (found.size === 0) {
        for (const key of Object.keys(row)) {
          if (mappedKeys.has(key) || key === 'Detected Sheet Class') continue;
          const lowerKey = key.toLowerCase().trim();
          if (lowerKey.endsWith(' total') || lowerKey.endsWith(' obtained')) continue;
          if (IGNORE_SUBJECT_COLS.has(lowerKey) || isNonSubjectColumn(key)) continue;
          const matchMax = key.match(/^(.+?)\s*[\(\[]\s*(\d+)\s*[\)\]]$/);
          const cleanName = matchMax ? matchMax[1].trim() : key.trim();
          const maxMarks = matchMax ? Number(matchMax[2]) : 100;
          if (!cleanName || found.has(cleanName) || IGNORE_SUBJECT_COLS.has(cleanName.toLowerCase()) || isNonSubjectColumn(cleanName)) continue;
          const val = row[key];
          if (val !== '' && val !== null && val !== undefined && Number.isFinite(Number(val))) {
            found.set(cleanName, maxMarks);
          }
        }
      }
      return found;
    };

    for (const row of sheetData.rows) {
      const cls = mapping.className ? String(row[mapping.className] ?? '').trim() : '';
      const displayCls = cls || 'All Classes';
      classNamesSet.add(displayCls);
      if (!subsMap[displayCls]) subsMap[displayCls] = new Map();
      const rowSubs = extractRowSubs(row);
      for (const [subName, tot] of rowSubs.entries()) {
        if (!subsMap[displayCls].has(subName)) {
          subsMap[displayCls].set(subName, tot);
        }
      }
    }

    const classes = Array.from(classNamesSet);
    const subjectsByClass: Record<string, { name: string; totalSample: number }[]> = {};
    let hasGenericSubjects = false;

    for (const cls of classes) {
      const sortedNames = sortSubjectNames(Array.from(subsMap[cls].keys()));
      subjectsByClass[cls] = sortedNames.map(name => {
        if (isGenericSubjectName(name)) hasGenericSubjects = true;
        return { name, totalSample: subsMap[cls].get(name) || 100 };
      });
    }

    return { classes, subjectsByClass, hasGenericSubjects };
  }, [sheetData, mapping]);

  useEffect(() => {
    if (detectedClassesAndSubjects.classes.length > 0 && !detectedClassesAndSubjects.classes.includes(selectedBookClass)) {
      setSelectedBookClass(detectedClassesAndSubjects.classes[0]);
    }
  }, [detectedClassesAndSubjects.classes, selectedBookClass]);

  const updateBookMapping = (clsDisplayName: string, originalSub: string, bookName: string) => {
    const clsKey = clsDisplayName === 'All Classes' ? '__default__' : normalizeClassKey(clsDisplayName);
    setBookMappings(prev => {
      const next: BookMappingsStore = {
        ...prev,
        [clsKey]: {
          ...(prev[clsKey] || {}),
          [originalSub]: bookName,
        },
      };
      saveBookMappings(next);
      return next;
    });
  };

  const applyCurrentClassBookNamesToAll = () => {
    if (!selectedBookClass) return;
    const sourceKey = selectedBookClass === 'All Classes' ? '__default__' : normalizeClassKey(selectedBookClass);
    const sourceMap = bookMappings[sourceKey] || {};
    setBookMappings(prev => {
      const next: BookMappingsStore = { ...prev };
      for (const cls of detectedClassesAndSubjects.classes) {
        const targetKey = cls === 'All Classes' ? '__default__' : normalizeClassKey(cls);
        next[targetKey] = { ...(next[targetKey] || {}), ...sourceMap };
      }
      saveBookMappings(next);
      return next;
    });
  };

  const handleImport = async () => {
    if (!selectedExamId || !sheetData) return;

    if (!mapping.studentId && !mapping.rollNumber) {
      alert("Please map either 'Student ID / Class ID' or 'Roll Number' in the Column Mapping section before importing.");
      return;
    }

    setImporting(true);
    let newCount = 0;
    let updatedCount = 0;
    let errorsCount = 0;
    const errorDetails: string[] = [];

    try {
      const existingResultsSnap = await getDocs(query(collection(db, 'results')));
      const existingResults = existingResultsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Result));

      const existingStudentsSnap = await getDocs(query(collection(db, 'students')));
      const existingStudents = existingStudentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student));

      for (let rowIdx = 0; rowIdx < sheetData.rows.length; rowIdx++) {
        const row = sheetData.rows[rowIdx];
        const rawStudentId = mapping.studentId ? safeStr(row[mapping.studentId], 50) : '';
        const rawRollNumber = mapping.rollNumber ? safeStr(row[mapping.rollNumber], 50) : '';
        const studentName = mapping.studentName ? safeStr(row[mapping.studentName], 100) : '';
        const className = mapping.className ? safeStr(row[mapping.className], 50) : '';
        const section = mapping.section ? safeStr(row[mapping.section], 50) : '';

        try {
          if (!rawRollNumber && !rawStudentId) {
            errorsCount++;
            errorDetails.push(`Row ${rowIdx + 1} (${studentName || 'Unknown'}): Missing both Student/Class ID and Roll Number.`);
            continue;
          }

          const finalStudentId = rawStudentId || rawRollNumber;
          const finalRollNumber = rawRollNumber || rawStudentId;

          const subjects: any[] = [];
          const mappedKeys = new Set(Object.values(mapping).filter(Boolean));
          const subMap: Record<string, { total?: number; obtained?: number }> = {};

          // First pass: paired Total / Obtained columns
          for (const key of Object.keys(row)) {
            if (mappedKeys.has(key) || key === 'Detected Sheet Class') continue;

            const lowerKey = key.toLowerCase().trim();
            const isTotal = lowerKey.endsWith(' total');
            const isObtained = lowerKey.endsWith(' obtained');

            if (isTotal || isObtained) {
              const subName = key.substring(0, key.lastIndexOf(' ')).trim();
              if (!subName || IGNORE_SUBJECT_COLS.has(subName.toLowerCase()) || isNonSubjectColumn(subName, { allowMonthlyTests: true })) continue;

              const rawVal = row[key];
              if (rawVal !== '' && rawVal !== null && rawVal !== undefined) {
                const val = Number(rawVal);
                if (Number.isFinite(val)) {
                  if (!subMap[subName]) subMap[subName] = {};
                  if (isTotal) subMap[subName].total = val;
                  if (isObtained) subMap[subName].obtained = val;
                }
              }
            }
          }

          // Second pass: single-column subjects ONLY for 1-row header sheets with no paired Total/Obtained columns
          if (Object.keys(subMap).length === 0) {
            for (const key of Object.keys(row)) {
              if (mappedKeys.has(key) || key === 'Detected Sheet Class') continue;

              const lowerKey = key.toLowerCase().trim();
              if (lowerKey.endsWith(' total') || lowerKey.endsWith(' obtained')) continue;
              if (IGNORE_SUBJECT_COLS.has(lowerKey) || isNonSubjectColumn(key, { allowMonthlyTests: true })) continue;

              const matchMax = key.match(/^(.+?)\s*[\(\[]\s*(\d+)\s*[\)\]]$/);
              const cleanSubName = matchMax ? matchMax[1].trim() : key.trim();
              const parsedMax = matchMax ? Number(matchMax[2]) : 100;

              if (!cleanSubName || subMap[cleanSubName] || IGNORE_SUBJECT_COLS.has(cleanSubName.toLowerCase()) || isNonSubjectColumn(cleanSubName, { allowMonthlyTests: true })) continue;

              const rawVal = row[key];
              if (rawVal !== '' && rawVal !== null && rawVal !== undefined) {
                const val = Number(rawVal);
                if (Number.isFinite(val)) {
                  subMap[cleanSubName] = { total: parsedMax, obtained: val };
                }
              }
            }
          }

          const clsKey = normalizeClassKey(className);
          const classBooks = bookMappings[clsKey] || {};
          const defaultBooks = bookMappings['__default__'] || {};

          for (const [subName, marks] of Object.entries(subMap)) {
            if (marks.obtained !== undefined) {
              const total = marks.total && marks.total > 0 ? marks.total : 100;
              const obtained = marks.obtained;
              const perc = (obtained / total) * 100;
              const mappedBookName = (classBooks[subName] || defaultBooks[subName] || subName).trim() || subName;
              subjects.push({
                subjectName: mappedBookName,
                totalMarks: total,
                obtainedMarks: obtained,
                percentage: perc,
                grade: perc >= 90 ? 'A+' : perc >= 80 ? 'A' : perc >= 70 ? 'B' : perc >= 60 ? 'C' : perc >= 50 ? 'D' : 'F',
              });
            }
          }

          const mainSubs = subjects.filter(s => !isNonSubjectColumn(s.subjectName));

          const calcTotal = mainSubs.reduce((acc, s) => acc + s.totalMarks, 0);
          const calcObtained = mainSubs.reduce((acc, s) => acc + s.obtainedMarks, 0);

          const tMarks = mapping.totalMarks && safeNum(row[mapping.totalMarks]) > 0 ? safeNum(row[mapping.totalMarks]) : calcTotal;
          const oMarks = mapping.obtainedMarks && row[mapping.obtainedMarks] !== '' && row[mapping.obtainedMarks] !== undefined
            ? safeNum(row[mapping.obtainedMarks])
            : calcObtained;
          const perc = mapping.percentage && safeNum(row[mapping.percentage]) > 0
            ? safeNum(row[mapping.percentage])
            : (tMarks > 0 ? (oMarks / tMarks) * 100 : 0);

          const autoGrade = perc >= 90 ? 'A+' : perc >= 80 ? 'A' : perc >= 70 ? 'B' : perc >= 60 ? 'C' : perc >= 50 ? 'D' : 'F';
          const gradeVal = mapping.grade ? safeStr(row[mapping.grade], 10) : '';
          const statusVal = mapping.resultStatus ? safeStr(row[mapping.resultStatus], 20) : '';

          const now = Date.now();
          const resultObj: Result = {
            studentId: finalStudentId,
            rollNumber: finalRollNumber,
            examId: selectedExamId,
            studentName,
            fatherName: mapping.fatherName ? safeStr(row[mapping.fatherName], 100) : '',
            className,
            section,
            status: 'Published',
            totalMarks: Number.isFinite(tMarks) ? tMarks : 0,
            obtainedMarks: Number.isFinite(oMarks) ? oMarks : 0,
            percentage: Number.isFinite(perc) ? perc : 0,
            grade: (gradeVal || autoGrade).slice(0, 10),
            resultStatus: (statusVal || (perc >= 33 ? 'PASS' : 'FAIL')).slice(0, 20),
            position: mapping.position ? safeStr(row[mapping.position], 20) : '',
            attendance: mapping.attendance ? safeStr(row[mapping.attendance], 20) : '',
            discipline: mapping.discipline ? safeStr(row[mapping.discipline], 20) : '',
            remarks: mapping.remarks ? safeStr(row[mapping.remarks], 500) : '',
            subjects: subjects.slice(0, 50),
            createdAt: now,
            updatedAt: now,
          };

          // Upsert student safely (never block result creation if student record fails)
          try {
            const existingStudent = existingStudents.find(s =>
              (rawStudentId && s.studentId === finalStudentId && (!className || s.class === className)) ||
              (s.rollNumber === finalRollNumber && (s.class || '').toLowerCase() === className.toLowerCase())
            );
            if (!existingStudent) {
              const studentObj: Student = {
                studentId: finalStudentId,
                rollNumber: finalRollNumber,
                studentName: studentName || finalStudentId,
                fatherName: resultObj.fatherName || '',
                class: className || 'General',
                section,
                active: true,
                createdAt: now,
                updatedAt: now,
              };
              const newStudentRef = doc(collection(db, 'students'));
              await setDoc(newStudentRef, studentObj);
              existingStudents.push({ id: newStudentRef.id, ...studentObj });
            }
          } catch (stuErr) {
            console.warn('Student auto-create skipped:', stuErr);
          }

          // Upsert Result (match by examId + unique studentId or class-scoped rollNumber)
          const existingResult = existingResults.find(r => {
            if (r.examId !== selectedExamId) return false;
            const sameClass = (r.className || '').trim().toLowerCase() === className.trim().toLowerCase();
            if (rawStudentId && rawStudentId !== rawRollNumber) {
              return r.studentId === finalStudentId && (!className || !r.className || sameClass);
            }
            return r.rollNumber === finalRollNumber && sameClass &&
              ((r.studentName || '').trim().toLowerCase() === studentName.trim().toLowerCase() || !studentName);
          });

          if (existingResult && existingResult.id) {
            resultObj.createdAt = existingResult.createdAt || now;
            await setDoc(doc(db, 'results', existingResult.id), resultObj);
            updatedCount++;
          } else {
            const newResultRef = doc(collection(db, 'results'));
            await setDoc(newResultRef, resultObj);
            existingResults.push({ id: newResultRef.id, ...resultObj });
            newCount++;
          }
        } catch (err: any) {
          console.error(err);
          errorsCount++;
          errorDetails.push(`Row ${rowIdx + 1} (${studentName || rawStudentId || rawRollNumber}): ${err?.message || 'Save failed'}`);
        }
      }
      setImportResult({ new: newCount, updated: updatedCount, errors: errorsCount, errorDetails });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'results');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <h2 className="text-2xl font-bold text-slate-800">Import Results from Excel</h2>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-2">1. Select Examination</label>
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="w-full md:w-1/2 rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-50 p-3"
          >
            <option value="">-- Choose Exam --</option>
            {exams.map(ex => (
              <option key={ex.id} value={ex.id}>{ex.examName} ({ex.academicSession})</option>
            ))}
          </select>
          {exams.length === 0 && (
            <p className="mt-2 text-sm text-red-600 font-medium">
              No exams found. <a href="/admin/exams" className="underline hover:text-red-800">Please click here to create an Exam first.</a>
            </p>
          )}
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-2">2. Upload Excel File</label>
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileUpload}
            className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />
          {file && <p className="text-xs text-slate-500 mt-2">Loaded: {file.name} ({sheets.length} sheet{sheets.length === 1 ? '' : 's'})</p>}
        </div>

        {sheetData && sheetData.sheetSummary.length > 0 && (
          <div className="mb-6 p-4 rounded-lg border border-slate-200 bg-slate-50">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Sheet Scan Summary</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {sheetData.sheetSummary.map((s, idx) => (
                <div key={idx} className="flex justify-between bg-white px-3 py-2 rounded border border-slate-200">
                  <span className="font-semibold text-slate-800">{s.name}</span>
                  <span className={s.rowCount > 0 ? 'text-green-700 font-medium' : 'text-slate-400'}>
                    {s.rowCount > 0 ? `${s.rowCount} rows (${s.status})` : s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {sheetData && sheetData.rows.length > 0 && (
          <div className="mb-6 p-4 bg-blue-50 text-blue-900 rounded-lg border border-blue-200 space-y-2">
            <h3 className="font-bold text-lg">File Processed Successfully!</h3>
            <p className="text-sm">Found <strong>{sheetData.rows.length}</strong> student records in the file.</p>
            <div className="text-xs flex flex-wrap gap-3 pt-1">
              <span className="bg-white px-2.5 py-1 rounded border border-blue-200">
                Student / Class ID: <strong>{mapping.studentId || 'Not Mapped (will use Roll No)'}</strong>
              </span>
              <span className="bg-white px-2.5 py-1 rounded border border-blue-200">
                Roll Number: <strong>{mapping.rollNumber || 'Not Mapped (will use Class/Student ID)'}</strong>
              </span>
              <span className="bg-white px-2.5 py-1 rounded border border-blue-200">
                Student Name: <strong>{mapping.studentName || 'Not Mapped'}</strong>
              </span>
              <span className="bg-white px-2.5 py-1 rounded border border-blue-200">
                Class: <strong>{mapping.className || 'Not Mapped'}</strong>
              </span>
            </div>
          </div>
        )}

        {sheetData && sheetData.rows.length === 0 && (
          <div className="mb-6 p-4 bg-red-50 text-red-800 rounded-lg border border-red-200 text-sm">
            No student rows could be detected in this file. Make sure the sheet contains column headers like <strong>Student Name</strong> and <strong>Roll No</strong> or <strong>Class ID</strong>.
          </div>
        )}

        {sheetData && sheetData.rows.length > 0 && (
          <div className="mb-6 overflow-x-auto border border-slate-200 rounded-lg">
            <div className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 uppercase">
              Preview (First {Math.min(5, sheetData.rows.length)} of {sheetData.rows.length} Records)
            </div>
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2">Student / Class ID</th>
                  <th className="px-3 py-2">Roll No</th>
                  <th className="px-3 py-2">Student Name</th>
                  <th className="px-3 py-2">Father Name</th>
                  <th className="px-3 py-2">Class</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sheetData.rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono">{mapping.studentId ? r[mapping.studentId] : (mapping.rollNumber ? r[mapping.rollNumber] : '-')}</td>
                    <td className="px-3 py-2 font-mono">{mapping.rollNumber ? r[mapping.rollNumber] : (mapping.studentId ? r[mapping.studentId] : '-')}</td>
                    <td className="px-3 py-2 font-semibold">{mapping.studentName ? r[mapping.studentName] : '-'}</td>
                    <td className="px-3 py-2">{mapping.fatherName ? r[mapping.fatherName] : '-'}</td>
                    <td className="px-3 py-2">{mapping.className ? r[mapping.className] : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sheetData && sheetData.headers.length > 0 && (
          <details className="mb-6 group" open={!mapping.studentId && !mapping.rollNumber}>
            <summary className="text-sm font-semibold text-slate-600 cursor-pointer hover:text-slate-900 list-none flex items-center">
              <span className="mr-2 text-lg">⚙️</span> Column Mapping (Click to Verify / Change)
            </summary>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="text-xs text-slate-500 mb-4">
                Verify how your Excel columns map to system fields. Unmapped subject/marks columns are imported automatically.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.keys(mapping).map(field => (
                  <div key={field}>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      {field === 'studentId' ? 'Student ID / Class ID' : field.replace(/([A-Z])/g, ' $1')}
                    </label>
                    <select
                      value={mapping[field]}
                      onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                      className="w-full rounded-lg border-slate-300 text-sm p-2 bg-slate-50"
                    >
                      <option value="">-- Do not map --</option>
                      {sheetData.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}

        {sheetData && detectedClassesAndSubjects.classes.length > 0 && (
          <details className="mb-6 rounded-xl border border-amber-200 bg-amber-50/50 p-4" open={detectedClassesAndSubjects.hasGenericSubjects}>
            <summary className="text-sm font-bold text-amber-900 cursor-pointer list-none flex items-center justify-between">
              <span>📚 Book Names Mapping (Subject 1, 2, 3... &rarr; Real Book Names)</span>
              {detectedClassesAndSubjects.hasGenericSubjects && (
                <span className="text-xs bg-amber-200 text-amber-900 px-2.5 py-0.5 rounded-full">Action Recommended</span>
              )}
            </summary>
            <div className="mt-4 space-y-4">
              <p className="text-xs text-slate-600">
                Enter the actual book name for each subject column (per class). These book names will appear on the Student Result Card instead of &quot;Subject 1, Subject 2...&quot;.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap gap-2">
                  {detectedClassesAndSubjects.classes.map(cls => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => setSelectedBookClass(cls)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        selectedBookClass === cls
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
                {detectedClassesAndSubjects.classes.length > 1 && selectedBookClass && (
                  <button
                    type="button"
                    onClick={applyCurrentClassBookNamesToAll}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline ml-auto"
                  >
                    Copy {selectedBookClass} names to all classes
                  </button>
                )}
              </div>

              {selectedBookClass && detectedClassesAndSubjects.subjectsByClass[selectedBookClass] && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {detectedClassesAndSubjects.subjectsByClass[selectedBookClass].map(({ name, totalSample }) => {
                    const clsKey = selectedBookClass === 'All Classes' ? '__default__' : normalizeClassKey(selectedBookClass);
                    const currentVal = bookMappings[clsKey]?.[name] || '';
                    return (
                      <div key={name} className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          {name} <span className="font-normal">({totalSample} marks)</span>
                        </label>
                        <input
                          type="text"
                          list="book-name-suggestions"
                          placeholder={`Book name for ${name}`}
                          value={currentVal}
                          onChange={(e) => updateBookMapping(selectedBookClass, name, e.target.value)}
                          className="w-full rounded border-slate-300 text-sm px-2.5 py-1.5 bg-slate-50 focus:bg-white focus:border-blue-500"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <datalist id="book-name-suggestions">
                {BOOK_NAME_SUGGESTIONS.map(book => (
                  <option key={book} value={book} />
                ))}
              </datalist>
            </div>
          </details>
        )}

        {sheetData && sheetData.rows.length > 0 && (
          <div className="pt-6 border-t border-slate-200">
            {!selectedExamId && (
              <p className="text-red-500 text-sm font-semibold mb-3">
                * Please select an Examination in Step 1 to enable importing.
              </p>
            )}
            <button
              onClick={handleImport}
              disabled={importing || !selectedExamId}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-bold w-full md:w-auto shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? 'Importing Data...' : 'Confirm & Import Results'}
            </button>
          </div>
        )}

        {importResult && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="text-green-800 font-bold mb-2">Import Complete!</h4>
            <ul className="text-sm text-green-700 space-y-1">
              <li>New Records Created: <span className="font-bold">{importResult.new}</span></li>
              <li>Existing Records Updated: <span className="font-bold">{importResult.updated}</span></li>
              <li>Errors / Skipped: <span className="font-bold text-red-600">{importResult.errors}</span></li>
            </ul>
            {importResult.errorDetails.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 max-h-40 overflow-y-auto space-y-1">
                {importResult.errorDetails.slice(0, 20).map((msg, idx) => (
                  <div key={idx}>{msg}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

