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
