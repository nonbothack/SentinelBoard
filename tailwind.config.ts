/**
 * Tailwind CSS v4 reads the active theme from src/index.css via @theme inline.
 * This typed palette mirrors the blueprint's tokens for tooling and reference;
 * it is not loaded as a legacy v3 config by the v4 Vite plugin.
 */
export const sentinelBoardColors = {
  background: {
    primary: '#13151a',
    secondary: '#1a1d24',
    tertiary: '#22262e',
    input: '#1e2128',
    surface: '#16181f',
  },
  border: {
    default: '#2e3240',
    subtle: '#242830',
    focus: '#4f8fff',
    panel: '#2a2e38',
  },
  text: {
    primary: '#e2e4e9',
    secondary: '#9ca3af',
    tertiary: '#6b7280',
  },
  severity: {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#3b82f6',
    info: '#6b7280',
  },
  status: {
    success: '#22c55e',
    pending: '#a78bfa',
  },
  interactive: {
    primary: '#4f8fff',
    hover: '#3b7de6',
  },
  commandBar: {
    background: '#1e2128',
    border: '#3b4252',
  },
} as const

export default {
  theme: {
    extend: {
      colors: sentinelBoardColors,
    },
  },
} as const
