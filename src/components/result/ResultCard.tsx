import React, { useEffect, useState } from 'react';
import { Result, Exam, SchoolSettings } from '../../types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import html2canvas from 'html2canvas';
import { toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';

interface ResultCardProps {
  result: Result;
  exam?: Exam;
}

export default function ResultCard({ result, exam }: ResultCardProps) {
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'general'));
        if (docSnap.exists()) {
          setSettings(docSnap.data() as SchoolSettings);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchSettings();
  }, []);

  const getCardImage = async (): Promise<string | null> => {
    const element = document.getElementById('result-card-content');
    if (!element) return null;

    // Create a dedicated top-level overlay container
    const overlay = document.createElement('div');
    overlay.id = 'print-capture-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '820px';
    overlay.style.minWidth = '820px';
    overlay.style.maxWidth = '820px';
    overlay.style.height = 'auto';
    overlay.style.zIndex = '999999';
    overlay.style.backgroundColor = '#ffffff';
    overlay.style.overflow = 'visible';
    overlay.style.margin = '0';
    overlay.style.padding = '10px';
    overlay.style.boxSizing = 'border-box';

    // Clone the result card
    const clone = element.cloneNode(true) as HTMLElement;
    clone.id = 'result-card-clone-rendered';
    clone.style.width = '800px';
    clone.style.minWidth = '800px';
    clone.style.maxWidth = '800px';
    clone.style.margin = '0 auto';
    clone.style.padding = '0';
    clone.style.boxShadow = 'none';
    clone.style.border = 'none';
    clone.style.backgroundColor = '#ffffff';

    overlay.appendChild(clone);
    document.body.appendChild(overlay);

    // Ensure all DOM nodes and layouts are settled
    await new Promise((resolve) => setTimeout(resolve, 250));

    try {
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 800,
        height: clone.scrollHeight,
        windowWidth: 820,
        windowHeight: clone.scrollHeight + 50,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        logging: false,
      });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      return dataUrl;
    } catch (err) {
      console.warn('html2canvas error, using toJpeg fallback:', err);
      try {
        return await toJpeg(clone, {
          quality: 0.95,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          width: 800,
          height: clone.scrollHeight,
        });
      } catch (e2) {
        console.error('toJpeg failed too:', e2);
        return null;
      }
    } finally {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    }
  };

  const handleDownloadPDF = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const imgData = await getCardImage();
      if (!imgData) throw new Error("Could not capture card");
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm
      
      const element = document.getElementById('result-card-content');
      const elementWidth = element?.offsetWidth || 800;
      const elementHeight = element?.offsetHeight || 1100;
      const calculatedHeight = Math.min((elementHeight * pdfWidth) / elementWidth, pdfHeight);
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, calculatedHeight);
      pdf.save(`${result.studentName || result.rollNumber}_${exam?.examName || 'Result'}.pdf`);
    } catch (error) {
      console.error(error);
      alert("Error generating PDF. Try opening in a new tab first.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadJPG = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const imgData = await getCardImage();
      if (!imgData) throw new Error("Could not capture card");
      
      const fileName = `${result.studentName || result.rollNumber}_${exam?.examName || 'Result'}.jpg`;
      
      try {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = imgData;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        console.log("Direct download failed, showing preview");
      }
      
      // Show preview overlay for mobile/iOS where silent downloads often fail
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
      if (isIOS || window.innerWidth <= 1024) {
         setPreviewImage(imgData);
      }
    } catch (error) {
      console.error(error);
      alert("Error generating Image. Try opening in a new tab first.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper to filter out meta subjects and imported totals (including Grand & Discipline)
  const isIgnoredMetaSubject = (name: string) => {
    if (!name || name.trim() === '') return true;
    const lower = name.toLowerCase().replace(/\s+/g, '');
    return lower.includes('month') ||
           lower.includes('discipline') ||
           lower === 'grand' ||
           lower === 'total' ||
           lower === 'grandtotal' ||
           lower === 'grandobtained' ||
           lower === 'totalmarks' ||
           lower === 'obtainedmarks' ||
           lower === 'overall' ||
           lower === 'percentage' ||
           lower === 'grade' ||
           lower === 'status' ||
           lower === 'result';
  };

  const isAttendanceName = (name: string) => {
    const lower = (name || '').toLowerCase().replace(/\s+/g, '');
    return lower.includes('attendance') || lower.includes('present') || lower.includes('workingday');
  };

  const filteredSubjects = (result.subjects || []).filter(s => !isIgnoredMetaSubject(s.subjectName));
  const regularSubjects = filteredSubjects.filter(s => !isAttendanceName(s.subjectName));
  let attendanceSub = filteredSubjects.find(s => isAttendanceName(s.subjectName));

  if (!attendanceSub && result.attendance && result.attendance.trim() !== '' && !isNaN(Number(result.attendance))) {
    const attObt = Number(result.attendance);
    const attTotal = 100;
    const attPercVal = (attObt / attTotal) * 100;
    attendanceSub = {
      subjectName: 'Attendance',
      totalMarks: attTotal,
      obtainedMarks: attObt,
      percentage: attPercVal,
      grade: attPercVal >= 90 ? 'A+' : attPercVal >= 80 ? 'A' : attPercVal >= 70 ? 'B' : attPercVal >= 60 ? 'C' : attPercVal >= 50 ? 'D' : 'F'
    };
  }

  // Place Attendance right below Ethics (or at the end of subjects)
  const mainSubjects = [...regularSubjects];
  if (attendanceSub) {
    const ethicsIndex = mainSubjects.findIndex(s => s.subjectName.toLowerCase().includes('ethic'));
    if (ethicsIndex !== -1) {
      mainSubjects.splice(ethicsIndex + 1, 0, attendanceSub);
    } else {
      mainSubjects.push(attendanceSub);
    }
  }

  const getSub = (keyword: string) =>
    result.subjects?.find(s => s.subjectName.toLowerCase().replace(/\s+/g, '').includes(keyword.toLowerCase()));

  const m1 = getSub('month1');
  const m2 = getSub('month2');
  const m3 = getSub('month3');

  // Calculate true totals from main subjects (including Attendance, excluding Grand/Discipline/Months)
  const trueTotal = mainSubjects.reduce((acc, s) => acc + s.totalMarks, 0);
  const trueObtained = mainSubjects.reduce((acc, s) => acc + s.obtainedMarks, 0);
  const truePercentage = trueTotal > 0 ? (trueObtained / trueTotal) * 100 : 0;
  const trueGrade = truePercentage >= 90 ? 'A+' : truePercentage >= 80 ? 'A' : truePercentage >= 70 ? 'B' : truePercentage >= 60 ? 'C' : truePercentage >= 50 ? 'D' : 'F';
  const trueStatus = truePercentage >= 33 ? 'Pass' : 'Fail';

  const attPerc = attendanceSub && attendanceSub.totalMarks > 0
    ? (attendanceSub.obtainedMarks / attendanceSub.totalMarks) * 100
    : null;

  // Calculate Monthly Test Averages
  let mTotal = 0;
  let mObtained = 0;
  let mCount = 0;
  [m1, m2, m3].forEach(m => {
    if (m && m.totalMarks > 0) {
      mTotal += m.totalMarks;
      mObtained += m.obtainedMarks;
      mCount++;
    }
  });
  const mAvgPerc = mTotal > 0 ? (mObtained / mTotal) * 100 : 0;
  const mAvgGrade = mAvgPerc >= 90 ? 'A+' : mAvgPerc >= 80 ? 'A' : mAvgPerc >= 70 ? 'B' : mAvgPerc >= 60 ? 'C' : mAvgPerc >= 50 ? 'D' : 'F';

  return (
    <div className="flex flex-col relative">
      <div className="flex justify-end space-x-2 print:hidden mb-4 mr-4">
        <button type="button" onClick={handleDownloadPDF} disabled={isGenerating} className={cn("text-white px-4 py-2 text-sm font-bold rounded shadow", isGenerating ? 'bg-slate-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700')}>
          {isGenerating ? 'Wait...' : 'Download PDF'}
        </button>
        <button type="button" onClick={handleDownloadJPG} disabled={isGenerating} className={cn("text-white px-4 py-2 text-sm font-bold rounded shadow", isGenerating ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700')}>
          {isGenerating ? 'Processing...' : 'Download JPG'}
        </button>
      </div>

      <div id="result-card-content" className="bg-white mx-auto w-full max-w-[210mm] text-slate-800 print:p-0 print:m-0 print:max-w-none print:w-full">
        
        {/* Header Block */}
        <div className="w-full">
          {/* Main Title */}
          <div className="bg-[#1e3a8a] text-white py-2 px-3 text-center">
            <h1 className="text-xl sm:text-2xl font-bold font-serif uppercase tracking-wide">
              {settings?.schoolName || 'IBN-E-Umar School System'}
            </h1>
          </div>
          {/* Address Line */}
          <div className="bg-[#4760a9] text-white py-0.5 px-3 text-center text-[11px]">
            {settings?.address || '23km Ferozpur Road, Suwa Gajumatta Kahna Nau Lahore | Ph: 0305-6883315'}
          </div>
          {/* Session Line */}
          <div className="bg-[#fff9e6] text-[#4a4a4a] py-1 px-3 text-center text-xs font-bold border-b border-[#e5e7eb]">
            {exam?.examName || 'First Term Examination'} — Session {exam?.academicSession || '2026 - 2027'}
          </div>
          {/* Result Card Title */}
          <div className="text-center py-1.5">
            <h2 className="text-[#d97706] text-base sm:text-lg font-bold uppercase tracking-widest">
              {settings?.resultCardTitle || 'STUDENT RESULT CARD'}
            </h2>
          </div>
        </div>

        <div className="p-4 sm:p-5 pt-0 print:p-2 print:pt-0">
          {/* Class ID Box */}
          <div className="flex items-center mb-1 text-[11px] font-bold">
            <span className="mr-2">Class:</span>
          </div>
          <div className="flex mb-2 text-xs font-bold">
            <div className="border-2 border-[#1e3a8a] text-[#1e3a8a] px-3 py-0.5 flex items-center">
              Class ID ➔
            </div>
            <div className="border-2 border-l-0 border-[#1e3a8a] text-blue-700 px-8 py-0.5 flex items-center">
              {result.className || '-'}
            </div>
          </div>

          {/* Student Info Table */}
          <div className="mb-2">
            <div className="bg-[#1e3a8a] text-white px-2 py-0.5 text-[11px] font-bold uppercase">STUDENT INFORMATION</div>
            <table className="w-full border-collapse border border-slate-300 text-xs font-bold">
              <tbody>
                <tr>
                  <td className="border border-slate-300 bg-[#f8fafc] px-2 py-1 w-1/4">Roll No</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700 w-1/4">{result.rollNumber}</td>
                  <td className="border border-slate-300 bg-[#f8fafc] px-2 py-1 w-1/4">Student Name</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700 w-1/4">{result.studentName || '-'}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 bg-[#f8fafc] px-2 py-1">Father Name</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{result.fatherName || '-'}</td>
                  <td className="border border-slate-300 bg-[#f8fafc] px-2 py-1">Class</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{result.className || '-'}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 bg-[#f8fafc] px-2 py-1">Section</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{result.section || '-'}</td>
                  <td className="border border-slate-300 px-2 py-1 bg-white" colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Subjects Table */}
          <div className="mb-2">
            <div className="bg-[#1e3a8a] text-white px-2 py-0.5 text-[11px] font-bold uppercase">SUBJECT-WISE RESULT</div>
            <table className="w-full border-collapse border border-slate-300 text-xs font-bold">
              <thead>
                <tr className="bg-[#d97706] text-white">
                  <th className="border border-slate-300 px-2 py-1 text-center">Subject</th>
                  <th className="border border-slate-300 px-2 py-1 text-center">Total Marks</th>
                  <th className="border border-slate-300 px-2 py-1 text-center">Obtained Marks</th>
                  <th className="border border-slate-300 px-2 py-1 text-center">Percentage (Grade)</th>
                  <th className="border border-slate-300 px-2 py-1 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {mainSubjects.map((sub, idx) => {
                  const subStatus = sub.percentage != null && sub.percentage >= 33 ? 'Pass' : 'Fail';
                  return (
                    <tr key={idx}>
                      <td className="border border-slate-300 px-2 py-1 text-center">{sub.subjectName}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{sub.totalMarks}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{sub.obtainedMarks}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center text-green-700">
                        {sub.percentage != null ? `${Math.round(sub.percentage)}%` : '-'} {sub.grade ? `(${sub.grade})` : ''}
                      </td>
                      <td className={cn("border border-slate-300 px-2 py-1 text-center", subStatus === 'Pass' ? 'text-green-700' : 'text-red-600')}>{subStatus}</td>
                    </tr>
                  );
                })}
                {/* Fill empty rows to keep card balanced if subjects are few */}
                {Array.from({ length: Math.max(0, 3 - mainSubjects.length) }).map((_, i) => (
                  <tr key={`empty-${i}`}>
                    <td className="border border-slate-300 px-2 py-1">&nbsp;</td>
                    <td className="border border-slate-300 px-2 py-1"></td>
                    <td className="border border-slate-300 px-2 py-1"></td>
                    <td className="border border-slate-300 px-2 py-1"></td>
                    <td className="border border-slate-300 px-2 py-1"></td>
                  </tr>
                ))}
                <tr className="bg-[#1e3a8a] text-white">
                  <td className="border border-slate-400 px-2 py-1 text-center uppercase tracking-wider">GRAND TOTAL</td>
                  <td className="border border-slate-400 px-2 py-1 text-center">{trueTotal}</td>
                  <td className="border border-slate-400 px-2 py-1 text-center">{trueObtained}</td>
                  <td className="border border-slate-400 px-2 py-1 text-center">{truePercentage.toFixed(2)}%</td>
                  <td className="border border-slate-400 px-2 py-1 text-center">{trueStatus}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Overall Summary row */}
          <div className="flex justify-between items-center mb-2 px-2 font-bold text-xs max-w-lg">
            <div>
              <span className="text-slate-800 mr-2">Overall Grade:</span>
              <span className="text-[#d97706] text-base">{trueTotal > 0 ? trueGrade : (result.grade || 'F')}</span>
            </div>
            <div>
              <span className="text-slate-800 mr-2">Overall Result:</span>
              <span className={cn("text-base", trueStatus === 'Pass' ? 'text-green-700' : 'text-red-600')}>
                {trueTotal > 0 ? trueStatus : (result.resultStatus || trueStatus)}
              </span>
            </div>
          </div>

          {/* Previous Monthly Test Report */}
          <div className="mb-2">
            <div className="bg-[#1e3a8a] text-white px-2 py-0.5 text-[11px] font-bold uppercase">PREVIOUS MONTHLY TEST REPORT</div>
            <table className="w-full max-w-xl border-collapse border border-slate-300 text-xs font-bold">
              <thead>
                <tr className="bg-[#d97706] text-white">
                  <th className="border border-slate-300 px-2 py-1 text-center">Month</th>
                  <th className="border border-slate-300 px-2 py-1 text-center">Total</th>
                  <th className="border border-slate-300 px-2 py-1 text-center">Obtained</th>
                  <th className="border border-slate-300 px-2 py-1 text-center">Percentage</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 bg-[#f8fafc] px-2 py-1 text-center">Month 1</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{m1?.totalMarks || 0}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{m1?.obtainedMarks || 0}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{m1 && m1.totalMarks > 0 ? ((m1.obtainedMarks / m1.totalMarks)*100).toFixed(2) : ''}%</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 bg-[#f8fafc] px-2 py-1 text-center">Month 2</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{m2?.totalMarks || 0}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{m2?.obtainedMarks || 0}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{m2 && m2.totalMarks > 0 ? ((m2.obtainedMarks / m2.totalMarks)*100).toFixed(2) : ''}%</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 bg-[#f8fafc] px-2 py-1 text-center">Month 3</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{m3?.totalMarks || 0}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{m3?.obtainedMarks || 0}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-green-700">{m3 && m3.totalMarks > 0 ? ((m3.obtainedMarks / m3.totalMarks)*100).toFixed(2) : ''}%</td>
                </tr>
                <tr className="bg-[#1e3a8a] text-white">
                  <td className="border border-slate-400 px-2 py-1 text-center">Average</td>
                  <td className="border border-slate-400 px-2 py-1 text-center" colSpan={2}>Average Percentage / Grade ➔</td>
                  <td className="border border-slate-400 px-2 py-1 text-center">{mCount > 0 ? `${mAvgPerc.toFixed(2)}% (${mAvgGrade})` : ''}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Remarks */}
          <div className="mb-4">
            <div className="bg-[#1e3a8a] text-white px-2 py-0.5 text-[11px] font-bold uppercase">REMARKS</div>
            <table className="w-full border-collapse border border-slate-300 text-xs font-bold">
              <tbody>
                <tr>
                  <td className="border border-slate-300 bg-[#f8fafc] px-2 py-1 w-28">Academic:</td>
                  <td className="border border-slate-300 px-2 py-1 italic text-green-700 font-normal">
                    {result.remarks || (truePercentage >= 80 ? 'Excellent performance. Keep it up!' : truePercentage >= 60 ? 'Good performance. Keep working hard.' : truePercentage >= 33 ? 'Satisfactory performance. Needs more effort.' : 'Needs serious improvement.')}
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-300 bg-[#f8fafc] px-2 py-1 w-28">Attendance:</td>
                  <td className={cn("border border-slate-300 px-2 py-1 italic font-normal", attPerc !== null && attPerc >= 75 ? "text-green-700" : "text-red-600")}>
                    {attPerc !== null && attPerc >= 75
                      ? 'Regular attendance. Keep it up!'
                      : 'Attendance is below the required level. Please ensure regular attendance.'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-4 mt-4 pt-2 pb-2">
            <div className="text-center">
              <div className="border-b border-black w-32 sm:w-36 mx-auto mb-1 h-6"></div>
              <p className="text-[10px] font-bold text-black uppercase">Parent / Guardian</p>
            </div>
            <div className="text-center">
              <div className="border-b border-black w-32 sm:w-36 mx-auto mb-1 h-6"></div>
              <p className="text-[10px] font-bold text-black uppercase">Class Teacher</p>
            </div>
            <div className="text-center">
              <div className="border-b border-black w-32 sm:w-36 mx-auto mb-1 h-6"></div>
              <p className="text-[10px] font-bold text-black uppercase">Principal</p>
            </div>
          </div>

        </div>
      </div>

      {/* Mobile Preview Fallback for iOS Safari */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col items-center justify-center p-4">
          <div className="text-white text-center mb-4 space-y-2">
            <h3 className="font-bold text-lg">Image Ready!</h3>
            <p className="text-sm text-gray-300">Long-press the image below and select "Save to Photos" to download it.</p>
          </div>
          <div className="relative max-h-[70vh] max-w-full overflow-auto bg-white rounded">
            <img src={previewImage} alt="Result Card Preview" className="max-w-full h-auto object-contain" />
          </div>
          <button 
            type="button"
            onClick={() => setPreviewImage(null)}
            className="mt-6 bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:bg-red-700"
          >
            Close Preview
          </button>
        </div>
      )}
    </div>
  );
}
