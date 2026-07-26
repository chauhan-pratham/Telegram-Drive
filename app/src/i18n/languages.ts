export type SupportedLanguage = 'en';

export interface LanguageInfo {
    code: SupportedLanguage;
    nativeLabel: string;
    englishLabel: string;
    dir: 'ltr' | 'rtl';
}

export const LANGUAGES: LanguageInfo[] = [
    { code: 'en', nativeLabel: 'English', englishLabel: 'English', dir: 'ltr' },
];
