import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store/store';
import { lengthInputValue, parseLength } from '../geometry/units';
import { MATERIALS, MATERIAL_GROUPS, getMaterialDef } from '../model/materials';
import { materialSwatch } from '../three/textures';
import type { MaterialRef } from '../model/types';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field" title={hint}>
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
    </label>
  );
}

/** Text input that commits on Enter/blur; Escape reverts. */
function CommitInput({ value, parse, onCommit, suffix, disabled }: { value: string; parse: (s: string) => number | null; onCommit: (v: number) => void; suffix?: string; disabled?: boolean }) {
  const [text, setText] = useState(value);
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  const commit = () => {
    const v = parse(text);
    if (v === null || !Number.isFinite(v)) {
      setBad(true);
      return;
    }
    setBad(false);
    onCommit(v);
  };
  return (
    <span className={`commit-input ${bad ? 'bad' : ''}`}>
      <input
        value={text}
        disabled={disabled}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          commit();
          setText(value);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setText(value);
            setBad(false);
            (e.target as HTMLInputElement).blur();
          }
          e.stopPropagation();
        }}
      />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}

/** Length input in the project's display unit; accepts units and arithmetic ("2.4m", "240+15"). */
export function LengthInput({ value, onChange, min, disabled }: { value: number; onChange: (cm: number) => void; min?: number; disabled?: boolean }) {
  const unit = useStore((s) => s.project.settings.unit);
  return (
    <CommitInput
      value={lengthInputValue(value, unit)}
      parse={(s) => {
        const v = parseLength(s, unit);
        if (v === null) return null;
        return min !== undefined ? Math.max(min, v) : v;
      }}
      onCommit={onChange}
      suffix={unit === 'ft' ? '' : unit}
      disabled={disabled}
    />
  );
}

export function NumberInput({ value, onChange, suffix, min, max }: { value: number; onChange: (v: number) => void; suffix?: string; min?: number; max?: number }) {
  return (
    <CommitInput
      value={String(+value.toFixed(2))}
      parse={(s) => {
        const v = parseFloat(s.replace(',', '.'));
        if (!Number.isFinite(v)) return null;
        return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
      }}
      onCommit={onChange}
      suffix={suffix}
    />
  );
}

export function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className="text-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onChange(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Select<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Swatch({ refId, size = 18 }: { refId: MaterialRef; size?: number }) {
  const def = getMaterialDef(refId);
  const img = materialSwatch(refId);
  return (
    <span
      className="swatch"
      style={{ width: size, height: size, background: img ? `url(${img}) center/cover` : def.color }}
      title={def.name}
    />
  );
}

/** Material picker: library materials grouped, plus a custom colour. */
export function MaterialPicker({ value, onChange, groups }: { value: MaterialRef; onChange: (v: MaterialRef) => void; groups?: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const def = getMaterialDef(value);
  const shownGroups = MATERIAL_GROUPS.filter((g) => !groups || groups.includes(g));
  return (
    <div className="mat-picker" ref={ref}>
      <button className="mat-button" onClick={() => setOpen(!open)} type="button">
        <Swatch refId={value} />
        <span>{def.name}</span>
      </button>
      {open && (
        <div className="mat-popover">
          {shownGroups.map((g) => (
            <div key={g} className="mat-group">
              <div className="mat-group-title">{g}</div>
              <div className="mat-grid">
                {MATERIALS.filter((m) => m.group === g).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`mat-cell ${m.id === value ? 'active' : ''}`}
                    title={m.name}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                  >
                    <Swatch refId={m.id} size={26} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="mat-group">
            <div className="mat-group-title">Custom colour</div>
            <input type="color" value={def.color} onChange={(e) => onChange(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="section">
      <header>
        <h3>{title}</h3>
        {actions}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}
