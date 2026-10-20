import css from './AquaAppearanceRow.module.css'

export interface SidebarFontSizeProps {
  label: string
  increaseLabel: string
  decreaseLabel: string
  value: number
  onChange: (value: number) => void
}

/** Matches the observed native font-size row; no slider or unused expander. */
export function SidebarFontSize({ label, increaseLabel, decreaseLabel, value, onChange }: SidebarFontSizeProps) {
  return <div className={css.fontRow}>
    <span className={css.fontTitle}>{label}</span>
    <div className={css.fontControl}>
      <div className={css.fontStepper} role="group" aria-label={label}>
        <span className={css.fontValue} aria-live="polite">{value}</span>
        <span className={css.fontArrows}>
          <button type="button" className={css.fontArrow} aria-label={increaseLabel} disabled={value >= 22} onClick={() => onChange(Math.min(22, value + 1))}>
            <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4" fill="none" stroke="currentColor"/></svg>
          </button>
          <button type="button" className={css.fontArrow} aria-label={decreaseLabel} disabled={value <= 12} onClick={() => onChange(Math.max(12, value - 1))}>
            <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor"/></svg>
          </button>
        </span>
      </div>
      <span className={css.fontUnit}>px</span>
    </div>
  </div>
}
