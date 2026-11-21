export const BOOK_NAME_SUGGESTIONS = [
  'English',
  'Urdu',
  'Mathematics',
  'Math',
  'Islamiat',
  'Islamiat Compulsory',
  'Islamiat Elective',
  'Pak Studies',
  'Pakistan Studies',
  'Tarjuma-tul-Quran',
  'T.Quran',
  'Physics',
  'Chemistry',
  'Biology',
  'Computer Science',
  'General Science',
  'G.Science',
  'General Math',
  'Social Studies',
  'Arabic',
  'Taleem-ul-Sarf',
  'Manzil/Nazra',
  'Nazra',
  'Ethics',
  'Drawing',
  'Attendance',
];

const STORAGE_KEY = 'ibneumar_book_mappings_v1';

export type BookMappingsStore = Record<string, Record<string, string>>;

export function normalizeClassKey(className?: string): string {
  const trimmed = (className || '').trim().toLowerCase();
  return trimmed || '__default__';
}

export function loadBookMappings(): BookMappingsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveBookMappings(mappings: BookMappingsStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  } catch {
    // Ignore storage quota errors
  }
}

export function sortSubjectNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const numA = a.match(/^subject\s*(\d+)$/i);
    const numB = b.match(/^subject\s*(\d+)$/i);
    if (numA && numB) {
      return Number(numA[1]) - Number(numB[1]);
    }
    if (numA) return -1;
    if (numB) return 1;
    return a.localeCompare(b);
  });
}

export function isGenericSubjectName(name: string): boolean {
  return /^subject\s*\d+$/i.test((name || '').trim());
}

const EXACT_NON_SUBJECT_COMPACT = new Set([
  'sr', 'srno', 'sno', 'serial', 'serialno',
  'roll', 'rollno', 'rollnumber',
  'studentid', 'stdid', 'classid', 'id', 'regno', 'admno',
  'name', 'studentname', 'fathername', 'class', 'classname', 'section',
  'phone', 'mobile', 'contact', 'cell', 'cnic', 'bform', 'dob', 'dateofbirth',
  'address', 'gender', 'sex',
  'total', 'grand', 'grandtotal', 'grandobtained', 'totalmarks', 'obtained', 'obtainedmarks', 'obt', 'obtmarks',
  'overall', 'overallpercentage', 'overallgrade', 'percentage', 'grade', 'status', 'result', 'resultstatus', 'passfail',
  'position', 'rank', 'division', 'remarks', 'discipline',
  'subjectsfailed', 'subjectfailed', 'failedsubjects', 'failed', 'failcount',
  'classslot', 'slot', 'idkey', 'key', 'helper',
]);

export function isNonSubjectColumn(name: string, options?: { allowMonthlyTests?: boolean }): boolean {
  const trimmed = (name || '').trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();
  const compact = lower.replace(/[^a-z0-9]/g, '');

  if (!compact) return true;
  if (/^column\s*\d+(\s*\(\d+\))?$/i.test(trimmed)) return true;
  if (lower.includes('(auto)')) return true;
  if (!options?.allowMonthlyTests && lower.includes('month')) return true;
  if (lower.includes('discipline')) return true;
  if (lower.includes('subjects failed') || lower.includes('subject failed') || lower.includes('failed subjects')) return true;
  if (lower.includes('class slot') || lower.includes('id key')) return true;
  if (EXACT_NON_SUBJECT_COMPACT.has(compact)) return true;

  return false;
}

