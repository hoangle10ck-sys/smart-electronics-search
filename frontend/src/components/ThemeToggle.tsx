import { useEffect, useState } from 'react';
import Icon, { IconName } from './Icon';

export type ThemePreference = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'smart-electronics-theme';
const cycle: ThemePreference[] = ['system', 'light', 'dark'];

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(preference: ThemePreference, systemDark: boolean) {
  const theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = theme;
}

export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(preference, media.matches);
    update();
    try { window.localStorage.setItem(STORAGE_KEY, preference); } catch { /* Theme still works for this session. */ }
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, [preference]);

  return {
    preference,
    setPreference,
    cyclePreference: () => setPreference((current) => cycle[(cycle.indexOf(current) + 1) % cycle.length]),
  };
}

export default function ThemeToggle({ preference, onChange }: { preference: ThemePreference; onChange: () => void }) {
  const labels: Record<ThemePreference, string> = { system: 'Theo hệ thống', light: 'Giao diện sáng', dark: 'Giao diện tối' };
  const icons: Record<ThemePreference, IconName> = { system: 'system', light: 'sun', dark: 'moon' };
  const next = cycle[(cycle.indexOf(preference) + 1) % cycle.length];

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onChange}
      aria-label={`${labels[preference]}. Nhấn để chuyển sang ${labels[next].toLocaleLowerCase('vi-VN')}`}
      title={`${labels[preference]} · Nhấn để đổi giao diện`}
    >
      <Icon name={icons[preference]} size={18} />
      <span>{labels[preference]}</span>
    </button>
  );
}
