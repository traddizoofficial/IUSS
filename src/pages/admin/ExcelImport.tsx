import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { collection, query, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Exam, Result, Student } from '../../types';

interface SheetData {
  headers: string[];
  rows: any[];
}

export default function ExcelImport() {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  
  // Mapping state
  const [mapping, setMapping] = useState<Record<string, string>>({
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
  });

  // Subject columns that we detect (any column not mapped to the main fields could be a subject)
  const [subjectColumns, setSubjectColumns] = useState<string[]>([]);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{new: number, updated: number, errors: number} | null>(null);

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
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);
    
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    setSheets(workbook.SheetNames);
    
    // Process all sheets automatically
    let allRows: any[] = [];
    let commonHeaders = new Set<string>();

    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
      if (rawData.length < 2) continue;

      // Find the main header row
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const rowString = rawData[i].join(' ').toLowerCase();
        if ((rowString.includes('name') || rowString.includes('student')) && (rowString.includes('roll') || rowString.includes('class id'))) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) continue;

      const topHeaders = rawData[headerRowIndex];
      const subHeaders = rawData[headerRowIndex + 1] || [];
      
      const flatHeaders: string[] = [];
      let currentSubject = '';
      
      for (let i = 0; i < topHeaders.length; i++) {
        let th = String(topHeaders[i]).trim();
        let sh = String(subHeaders[i] || '').trim();
        
        if (th && th !== currentSubject) {
          currentSubject = th;
        }
        
        if (sh.toLowerCase() === 'total' || sh.toLowerCase() === 'obtained') {
           flatHeaders[i] = `${currentSubject} ${sh}`;
        } else {
           flatHeaders[i] = th || sh || `Column ${i}`;
        }
        commonHeaders.add(flatHeaders[i]);
      }

      for (let i = headerRowIndex + 2; i < rawData.length; i++) {
        const rowArr = rawData[i];
        if (rowArr.every((val: any) => val === '' || val === null || val === undefined)) continue;
        
        const rowObj: any = {};
        flatHeaders.forEach((h, index) => {
          rowObj[h] = rowArr[index];
        });
        
        // Ensure this row has at least an identifier (Name, Roll, or ID) before considering it a valid student row
        const rollFound = flatHeaders.find(h => h.toLowerCase().includes('roll'));
        const idFound = flatHeaders.find(h => h.toLowerCase().includes('id') && h.toLowerCase().includes('class'));
        const nameFound = flatHeaders.find(h => h.toLowerCase().includes('name') && !h.toLowerCase().includes('father'));
        
        if ((rollFound && rowObj[rollFound]) || (idFound && rowObj[idFound]) || (nameFound && rowObj[nameFound])) {
          allRows.push(rowObj);
        }
      }
    }

    // Deduplicate students based on Name + Roll No or Class ID to avoid double processing if "Data Sheet" contains everything
    const uniqueRowsMap = new Map();
    const finalHeaders = Array.from(commonHeaders);
    
    allRows.forEach(row => {
      const idKey = finalHeaders.find(h => h.toLowerCase().includes('id') && h.toLowerCase().includes('class'));
      const rollKey = finalHeaders.find(h => h.toLowerCase().includes('roll'));
      const nameKey = finalHeaders.find(h => h.toLowerCase().includes('name') && !h.toLowerCase().includes('father'));
      
      let dedupKey = '';
      if (idKey && row[idKey]) {
        dedupKey = String(row[idKey]).trim();
      } else if (nameKey && row[nameKey] && rollKey && row[rollKey]) {
        dedupKey = `${String(row[nameKey]).trim().toLowerCase()}-${String(row[rollKey]).trim()}`;
      } else if (nameKey && row[nameKey]) {
        dedupKey = String(row[nameKey]).trim().toLowerCase();
      } else {
        dedupKey = Math.random().toString();
      }

      // Merge data so that we don't lose any filled subject marks if a student appears in multiple sheets
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
      setSheetData({ headers: finalHeaders, rows: uniqueRows });
      
      const newMapping = { ...mapping };
      finalHeaders.forEach(h => {
        const lower = h.toLowerCase();
        if ((lower.includes('id') && lower.includes('class')) || lower === 'student id' || lower === 'id') newMapping.studentId = h;
        else if (lower.includes('roll')) newMapping.rollNumber = h;
        else if (lower.includes('name') && lower.includes('father')) newMapping.fatherName = h;
        else if (lower.includes('name') && !lower.includes('father')) newMapping.studentName = h;
        else if (lower === 'class' || lower.includes('class name')) newMapping.className = h;
        else if (lower.includes('section')) newMapping.section = h;
        else if (lower.includes('total') && lower.includes('mark') && !lower.includes('english')) newMapping.totalMarks = h;
      });
      setMapping(newMapping);
    } else {
      setSheetData({ headers: [], rows: [] });
    }
  };

  const handleImport = async () => {
    if (!selectedExamId || !sheetData) return;

    if (!mapping.studentId && !mapping.rollNumber) {
      alert("Please map either 'Student ID' or 'Roll Number' in the Advanced Column Mapping section before importing.");
      return;
    }

    setImporting(true);
    let newCount = 0;
    let updatedCount = 0;
    let errorsCount = 0;

    try {
      // Get existing results to know if update or create
      const existingResultsSnap = await getDocs(query(collection(db, 'results')));
      const existingResults = existingResultsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Result));

      // Get existing students
      const existingStudentsSnap = await getDocs(query(collection(db, 'students')));
      const existingStudents = existingStudentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student));

      for (const row of sheetData.rows) {
        try {
          const studentId = String(row[mapping.studentId] || '').trim();
          const rollNumber = String(row[mapping.rollNumber] || '').trim();
          const studentName = String(row[mapping.studentName] || '').trim();
          
          if (!rollNumber && !studentId) {
            errorsCount++;
            continue;
          }

          // Generate subjects. Group by subject name based on our flattened headers (e.g., 'English Total' and 'English Obtained')
          const subjects: any[] = [];
          const mappedKeys = Object.values(mapping).filter(v => v);
          
          // Temporary map to collect subject marks
          const subMap: Record<string, { total?: number, obtained?: number }> = {};
          
          for (const key of Object.keys(row)) {
            if (!mappedKeys.includes(key)) {
              // It's a subject column
              const isTotal = key.toLowerCase().endsWith('total');
              const isObtained = key.toLowerCase().endsWith('obtained');
              
              if (isTotal || isObtained) {
                const subName = key.substring(0, key.lastIndexOf(' ')).trim();
                const rawVal = row[key];
                
                // Only process if the cell is not empty
                if (rawVal !== '' && rawVal !== null && rawVal !== undefined) {
                  // even if it's 0 it is a number
                  const val = Number(rawVal);
                  if (!isNaN(val)) {
                    if (!subMap[subName]) subMap[subName] = {};
                    if (isTotal) subMap[subName].total = val;
                    if (isObtained) subMap[subName].obtained = val;
                  }
                }
              }
            }
          }
          
          for (const [subName, marks] of Object.entries(subMap)) {
            if (marks.obtained !== undefined) {
              const total = marks.total || 100;
              const obtained = marks.obtained;
              const perc = (obtained / total) * 100;
              subjects.push({
                subjectName: subName,
                totalMarks: total,
                obtainedMarks: obtained,
                percentage: perc,
                grade: perc >= 90 ? 'A+' : perc >= 80 ? 'A' : perc >= 70 ? 'B' : perc >= 60 ? 'C' : perc >= 50 ? 'D' : 'F'
              });
            }
          }

          let tMarks = Number(row[mapping.totalMarks]) || subjects.reduce((acc, s) => acc + s.totalMarks, 0);
          let oMarks = Number(row[mapping.obtainedMarks]) || subjects.reduce((acc, s) => acc + s.obtainedMarks, 0);
          let perc = Number(row[mapping.percentage]) || (tMarks > 0 ? (oMarks / tMarks) * 100 : 0);

          const resultObj: Result = {
            studentId: studentId || rollNumber, // fallback if one is missing
            rollNumber: rollNumber || studentId,
            examId: selectedExamId,
            studentName,
            fatherName: String(row[mapping.fatherName] || ''),
            className: String(row[mapping.className] || ''),
            section: String(row[mapping.section] || ''),
            status: 'Published', // Set to Published so it's instantly visible to students
            totalMarks: tMarks,
            obtainedMarks: oMarks,
            percentage: perc,
            grade: String(row[mapping.grade] || (perc >= 90 ? 'A+' : perc >= 80 ? 'A' : perc >= 70 ? 'B' : perc >= 60 ? 'C' : 'F')),
            resultStatus: String(row[mapping.resultStatus] || (perc >= 33 ? 'PASS' : 'FAIL')),
            position: String(row[mapping.position] || ''),
            attendance: String(row[mapping.attendance] || ''),
            discipline: String(row[mapping.discipline] || ''),
            remarks: String(row[mapping.remarks] || ''),
            subjects: subjects,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          const studentObj: Partial<Student> = {
            studentId: resultObj.studentId,
            rollNumber: resultObj.rollNumber,
            studentName: resultObj.studentName,
            fatherName: String(row[mapping.fatherName] || ''),
            class: resultObj.className,
            section: resultObj.section,
            active: true,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          // Check if student exists, if not create
          const existingStudent = existingStudents.find(s => s.studentId === resultObj.studentId || s.rollNumber === resultObj.rollNumber);
          if (!existingStudent) {
            const newStudentRef = doc(collection(db, 'students'));
            await setDoc(newStudentRef, studentObj);
          }

          // Upsert Result
          const existingResult = existingResults.find(r => 
            r.examId === selectedExamId && 
            (r.studentId === resultObj.studentId || r.rollNumber === resultObj.rollNumber)
          );

          if (existingResult) {
            resultObj.createdAt = existingResult.createdAt;
            await setDoc(doc(db, 'results', existingResult.id!), resultObj);
            updatedCount++;
          } else {
            await setDoc(doc(collection(db, 'results')), resultObj);
            newCount++;
          }

        } catch (err) {
          console.error(err);
          errorsCount++;
        }
      }
      setImportResult({ new: newCount, updated: updatedCount, errors: errorsCount });
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
        </div>

        {sheetData && sheetData.rows.length > 0 && (
          <div className="mb-6 p-4 bg-blue-50 text-blue-800 rounded-lg border border-blue-200">
            <h3 className="font-bold text-lg mb-1">File Processed Successfully!</h3>
            <p className="text-sm">Found <strong>{sheetData.rows.length}</strong> student records in the file.</p>
            <p className="text-sm mt-2 opacity-80">The system will automatically extract Student IDs, names, and subject marks.</p>
          </div>
        )}

        {sheetData && sheetData.headers.length > 0 && (
          <details className="mb-6 group">
            <summary className="text-sm font-semibold text-slate-500 cursor-pointer hover:text-slate-800 list-none flex items-center">
              <span className="mr-2 text-lg">⚙️</span> Advanced: View/Edit Column Mapping (Optional)
            </summary>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Map Columns</h3>
              <p className="text-xs text-slate-500 mb-4">Map your Excel columns to the system fields. Any unmapped columns containing numbers will be treated as subjects.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.keys(mapping).map(field => (
                  <div key={field}>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">{field.replace(/([A-Z])/g, ' $1')}</label>
                    <select
                      value={mapping[field]}
                      onChange={(e) => setMapping({...mapping, [field]: e.target.value})}
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

        {sheetData && (
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
          </div>
        )}
      </div>
    </div>
  );
}
