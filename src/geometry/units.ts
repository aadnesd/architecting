import type { LengthUnit } from '../model/types';

const CM_PER: Record<string, number> = {
  mm: 0.1,
  cm: 1,
  m: 100,
  in: 2.54,
  '"': 2.54,
  ft: 30.48,
  "'": 30.48,
};

export const UNIT_LABELS: Record<LengthUnit, string> = {
  mm: 'Millimetres',
  cm: 'Centimetres',
  m: 'Metres',
  in: 'Inches',
  ft: 'Feet & inches',
};

function trimZeros(s: string) {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Format a length stored in cm for display. */
export function formatLength(cm: number, unit: LengthUnit, withUnit = true): string {
  if (!Number.isFinite(cm)) return '–';
  switch (unit) {
    case 'mm':
      return `${Math.round(cm * 10)}${withUnit ? ' mm' : ''}`;
    case 'cm':
      return `${trimZeros(cm.toFixed(1))}${withUnit ? ' cm' : ''}`;
    case 'm':
      return `${trimZeros((cm / 100).toFixed(3))}${withUnit ? ' m' : ''}`;
    case 'in':
      return `${trimZeros((cm / 2.54).toFixed(2))}${withUnit ? '"' : ''}`;
    case 'ft': {
      const totalIn = Math.round((cm / 2.54) * 4) / 4;
      const sign = totalIn < 0 ? '-' : '';
      const abs = Math.abs(totalIn);
      const ft = Math.floor(abs / 12);
      const inch = abs - ft * 12;
      return `${sign}${ft}' ${trimZeros(inch.toFixed(2))}"`;
    }
  }
}

/** Numeric value for an input box, without unit suffix (ft uses the ft-in notation). */
export function lengthInputValue(cm: number, unit: LengthUnit) {
  return unit === 'ft' ? formatLength(cm, unit) : formatLength(cm, unit, false);
}

export function formatArea(cm2: number, unit: LengthUnit) {
  if (unit === 'in' || unit === 'ft') return `${(cm2 / 929.0304).toFixed(1)} ft²`;
  return `${(cm2 / 10000).toFixed(2)} m²`;
}

/**
 * Parse a length typed by the user. Accepts plain numbers (interpreted in the default unit),
 * explicit units (`2.4m`, `90cm`, `36in`, `8'6"`), and simple arithmetic (`240+60`, `3*60`, `(300-10)/2`).
 * Returns the length in cm, or null when the text cannot be parsed.
 */
export function parseLength(text: string, defaultUnit: LengthUnit): number | null {
  const src = text.trim().toLowerCase().replace(/,/g, '.');
  if (!src) return null;
  let pos = 0;
  const peek = () => src[pos];
  const skip = () => {
    while (src[pos] === ' ') pos++;
  };

  // Each number literal becomes a length in cm. Products and quotients of two lengths make no sense,
  // so the right operand of * and / is read as a plain scalar.
  function number(asScalar: boolean): number | null {
    skip();
    const m = /^\d*\.?\d+(e[+-]?\d+)?/.exec(src.slice(pos));
    if (!m) return null;
    pos += m[0].length;
    const value = parseFloat(m[0]);
    if (asScalar) return value;
    skip();
    const u = /^(mm|cm|m|in|ft|"|')/.exec(src.slice(pos));
    if (u) {
      pos += u[0].length;
      let cm = value * CM_PER[u[0]];
      if (u[0] === "'" || u[0] === 'ft') {
        // Allow feet followed directly by inches: 8'6" or 8ft 6in
        const save = pos;
        skip();
        const m2 = /^(\d*\.?\d+)\s*("|in)?/.exec(src.slice(pos));
        if (m2 && m2[0].length) {
          pos += m2[0].length;
          cm += parseFloat(m2[1]) * 2.54;
        } else pos = save;
      }
      return cm;
    }
    if (defaultUnit === 'ft') return value * 30.48;
    return value * CM_PER[defaultUnit];
  }

  function factor(asScalar: boolean): number | null {
    skip();
    if (peek() === '(') {
      pos++;
      const val = expr(asScalar);
      skip();
      if (peek() !== ')') return null;
      pos++;
      return val;
    }
    if (peek() === '-') {
      pos++;
      const f = factor(asScalar);
      return f === null ? null : -f;
    }
    return number(asScalar);
  }

  function term(asScalar: boolean): number | null {
    let left = factor(asScalar);
    if (left === null) return null;
    for (;;) {
      skip();
      const op = peek();
      if (op !== '*' && op !== '/') return left;
      pos++;
      const right = factor(true);
      if (right === null) return null;
      left = op === '*' ? left * right : right === 0 ? null : left / right;
      if (left === null) return null;
    }
  }

  function expr(asScalar: boolean): number | null {
    let left = term(asScalar);
    if (left === null) return null;
    for (;;) {
      skip();
      const op = peek();
      if (op !== '+' && op !== '-') return left;
      pos++;
      const right = term(asScalar);
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
  }

  const result = expr(false);
  skip();
  if (result === null || pos !== src.length || !Number.isFinite(result)) return null;
  return result;
}
