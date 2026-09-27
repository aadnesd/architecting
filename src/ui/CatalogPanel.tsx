import { useMemo, useState } from 'react';
import { CATALOG, CATEGORIES, OPENING_PRESETS, type CatalogItem } from '../model/catalog';
import { useStore } from '../store/store';
import { ItemSymbol } from '../plan/PlanSymbols';
import { createItem } from '../model/factory';
import { formatLength } from '../geometry/units';

function Thumb({ c }: { c: CatalogItem }) {
  const item = useMemo(() => createItem('', c.kind, 0, 0), [c.kind]);
  const s = Math.max(c.width, c.depth);
  const pad = s * 0.08;
  return (
    <svg viewBox={`${-s / 2 - pad} ${-s / 2 - pad} ${s + pad * 2} ${s + pad * 2}`} className="thumb">
      <ItemSymbol item={item} px={s / 40} selected={false} />
    </svg>
  );
}

function OpeningThumb({ door, kind }: { door: boolean; kind: string }) {
  return (
    <svg viewBox="-60 -60 120 120" className="thumb">
      <rect x={-60} y={-8} width={120} height={16} fill="#3d4148" />
      <rect x={-40} y={-8} width={80} height={16} fill="#fff" />
      {door ? (
        kind === 'slidingDoor' ? (
          <>
            <rect x={-40} y={-4} width={44} height={3} fill="#fff" stroke="#2b2f36" strokeWidth={2} />
            <rect x={-4} y={1} width={44} height={3} fill="#fff" stroke="#2b2f36" strokeWidth={2} />
          </>
        ) : kind === 'doubleDoor' ? (
          <>
            <path d="M -40 -8 L -40 -48 A 40 40 0 0 1 0 -8" fill="none" stroke="#2b2f36" strokeWidth={2.5} />
            <path d="M 40 -8 L 40 -48 A 40 40 0 0 0 0 -8" fill="none" stroke="#2b2f36" strokeWidth={2.5} />
          </>
        ) : kind === 'garageDoor' ? (
          <line x1={-40} y1={-30} x2={40} y2={-30} stroke="#2b2f36" strokeWidth={2.5} strokeDasharray="8 4" />
        ) : kind === 'archway' ? null : (
          <path d="M -40 -8 L -40 -88 A 80 80 0 0 1 40 -8" fill="none" stroke="#2b2f36" strokeWidth={2.5} transform="scale(1 0.55) translate(0 -6)" />
        )
      ) : (
        <>
          <line x1={-40} y1={-6} x2={40} y2={-6} stroke="#2b2f36" strokeWidth={2} />
          <line x1={-40} y1={0} x2={40} y2={0} stroke="#2b2f36" strokeWidth={3} />
          <line x1={-40} y1={6} x2={40} y2={6} stroke="#2b2f36" strokeWidth={2} />
          {kind === 'doubleWindow' && <line x1={0} y1={-8} x2={0} y2={8} stroke="#2b2f36" strokeWidth={2} />}
        </>
      )}
    </svg>
  );
}

export default function CatalogPanel() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('All');
  const placing = useStore((s) => s.placing);
  const setPlacing = useStore((s) => s.setPlacing);
  const unit = useStore((s) => s.project.settings.unit);

  const query = q.trim().toLowerCase();
  const items = CATALOG.filter(
    (c) => (cat === 'All' || c.category === cat) && (!query || `${c.name} ${c.category} ${c.tags ?? ''} ${c.kind}`.toLowerCase().includes(query)),
  );
  const openings = OPENING_PRESETS.filter((o) => (cat === 'All' || cat === 'Doors & windows') && (!query || o.name.toLowerCase().includes(query) || (o.isDoor ? 'door' : 'window').includes(query)));
  const cats = ['All', 'Doors & windows', ...CATEGORIES];

  return (
    <div className="catalog">
      <input className="search" placeholder="Search furniture, fixtures…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <div className="chips">
        {cats.map((c) => (
          <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      {openings.length > 0 && (
        <>
          <div className="catalog-heading">Doors &amp; windows</div>
          <div className="catalog-grid">
            {openings.map((o) => (
              <button
                key={o.kind}
                className={`catalog-card ${placing?.type === 'opening' && placing.kind === o.kind ? 'active' : ''}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/x-opening-kind', o.kind)}
                onClick={() => setPlacing({ type: 'opening', kind: o.kind })}
                title={`${o.name} — click, then click on a wall (or drag onto a wall)`}
              >
                <OpeningThumb door={o.isDoor} kind={o.kind} />
                <span className="catalog-name">{o.name}</span>
                <span className="catalog-size">
                  {formatLength(o.width, unit)} × {formatLength(o.height, unit)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {CATEGORIES.filter((c) => items.some((i) => i.category === c)).map((c) => (
        <div key={c}>
          <div className="catalog-heading">{c}</div>
          <div className="catalog-grid">
            {items
              .filter((i) => i.category === c)
              .map((i) => (
                <button
                  key={i.kind}
                  className={`catalog-card ${placing?.type === 'item' && placing.kind === i.kind ? 'active' : ''}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/x-item-kind', i.kind)}
                  onClick={() => setPlacing({ type: 'item', kind: i.kind })}
                  title={`${i.name} — click, then click in the plan (or drag into the plan)`}
                >
                  <Thumb c={i} />
                  <span className="catalog-name">{i.name}</span>
                  <span className="catalog-size">
                    {formatLength(i.width, unit, false)}×{formatLength(i.depth, unit, false)}×{formatLength(i.height, unit, false)}
                  </span>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
