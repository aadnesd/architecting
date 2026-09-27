import { useEffect, useRef, useState } from 'react';
import { Download, Square, Sparkles, X } from 'lucide-react';
import { useStore } from '../store/store';
import { registry } from '../three/registry';
import type { RenderJob } from '../three/pathRender';

const SIZES = [
  { id: 'view', label: 'Current view' },
  { id: '960x540', label: 'Draft 960×540' },
  { id: '1280x720', label: 'HD 1280×720' },
  { id: '1920x1080', label: 'Full HD 1920×1080' },
  { id: '2560x1440', label: '2K 2560×1440' },
  { id: '1600x1600', label: 'Square 1600×1600' },
  { id: '1200x1600', label: 'Portrait 1200×1600' },
];

const QUALITY = [
  { samples: 32, label: 'Preview (32 samples)' },
  { samples: 128, label: 'Good (128)' },
  { samples: 512, label: 'High (512)' },
  { samples: 2000, label: 'Final (2000)' },
];

function safeName(s: string) {
  return (s || 'render').replace(/[^\w\-. ]+/g, '_');
}

export default function RenderDialog() {
  const open = useStore((s) => s.renderOpen);
  const setOpen = useStore((s) => s.setRenderOpen);
  const name = useStore((s) => s.project.name);
  const [size, setSize] = useState('1920x1080');
  const [samples, setSamples] = useState(128);
  const [bounces, setBounces] = useState(6);
  const [denoise, setDenoise] = useState(true);
  const [exposure, setExposure] = useState(1);
  const [status, setStatus] = useState<{ phase: 'idle' | 'building' | 'rendering' | 'done' | 'error'; samples: number; message?: string }>({ phase: 'idle', samples: 0 });
  const [elapsed, setElapsed] = useState(0);
  const job = useRef<RenderJob | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const started = useRef(0);

  const cleanup = () => {
    job.current?.dispose();
    job.current = null;
    if (holder.current) holder.current.innerHTML = '';
  };
  useEffect(() => () => cleanup(), []);
  useEffect(() => {
    if (!open) {
      cleanup();
      setStatus({ phase: 'idle', samples: 0 });
    }
  }, [open]);
  useEffect(() => {
    if (status.phase !== 'rendering' && status.phase !== 'building') return;
    const t = setInterval(() => setElapsed((performance.now() - started.current) / 1000), 500);
    return () => clearInterval(t);
  }, [status.phase]);

  if (!open) return null;

  const dims = () => {
    if (size === 'view') {
      const c = registry.gl?.domElement;
      const w = c?.clientWidth ?? 1280;
      const h = c?.clientHeight ?? 720;
      return { width: Math.round(w * 1.5), height: Math.round(h * 1.5) };
    }
    const [w, h] = size.split('x').map(Number);
    return { width: w, height: h };
  };

  const start = async () => {
    cleanup();
    useStore.getState().clearSelection();
    await new Promise((r) => setTimeout(r, 50));
    started.current = performance.now();
    setElapsed(0);
    try {
      const { startPathTrace } = await import('../three/pathRender');
      const j = await startPathTrace({ ...dims(), samples, bounces, denoise, exposure }, (n, phase) => setStatus({ phase, samples: n }));
      job.current = j;
      j.canvas.className = 'render-canvas';
      holder.current?.appendChild(j.canvas);
    } catch (e) {
      setStatus({ phase: 'error', samples: 0, message: String((e as Error).message ?? e) });
    }
  };

  const download = () => {
    const c = job.current?.canvas;
    if (!c) return;
    c.toBlob((b) => {
      if (!b) return;
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName(name)}-render.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  };

  const busy = status.phase === 'building' || status.phase === 'rendering';
  const pct = Math.min(100, (status.samples / samples) * 100);

  return (
    <div className="modal-backdrop" onKeyDown={(e) => e.stopPropagation()}>
      <div className="modal render-modal" role="dialog" aria-label="Photorealistic render">
        <header>
          <h2>
            <Sparkles size={16} /> Photorealistic render
          </h2>
          <button className="icon-btn" onClick={() => setOpen(false)} title="Close">
            <X size={15} />
          </button>
        </header>
        <div className="render-body">
          <div className="render-settings">
            <p className="muted">Path-traces the current 3D camera view: light bounces between surfaces, sky light comes through windows, and you get real reflections and glass. Frame the shot in the 3D view first.</p>
            <label className="field">
              <span className="field-label">Resolution</span>
              <select className="select" value={size} onChange={(e) => setSize(e.target.value)} disabled={busy}>
                {SIZES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Quality</span>
              <select className="select" value={samples} onChange={(e) => setSamples(+e.target.value)} disabled={busy}>
                {QUALITY.map((q) => (
                  <option key={q.samples} value={q.samples}>
                    {q.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Light bounces: {bounces}</span>
              <input type="range" min={2} max={12} value={bounces} onChange={(e) => setBounces(+e.target.value)} disabled={busy} />
            </label>
            <label className="field">
              <span className="field-label">Exposure: {exposure.toFixed(2)}</span>
              <input type="range" min={0.4} max={2.5} step={0.05} value={exposure} onChange={(e) => setExposure(+e.target.value)} disabled={busy} />
            </label>
            <label className="toggle">
              <input type="checkbox" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} disabled={busy} />
              <span>Denoise</span>
            </label>
            <div className="render-actions">
              {busy ? (
                <button className="btn" onClick={() => job.current?.stop()}>
                  <Square size={13} /> Stop here
                </button>
              ) : (
                <button className="btn primary" onClick={start}>
                  <Sparkles size={14} /> {status.phase === 'done' ? 'Render again' : 'Start render'}
                </button>
              )}
              <button className="btn" onClick={download} disabled={!job.current || status.phase === 'building'}>
                <Download size={14} /> Save PNG
              </button>
            </div>
            {status.phase !== 'idle' && (
              <div className="render-status">
                {status.phase === 'error' ? (
                  <span className="error">{status.message}</span>
                ) : (
                  <>
                    <div className="progress">
                      <div style={{ width: `${status.phase === 'building' ? 3 : pct}%` }} />
                    </div>
                    <span>
                      {status.phase === 'building' ? 'Preparing scene…' : status.phase === 'done' ? 'Done' : 'Rendering'} · {status.samples}/{samples} samples · {elapsed.toFixed(0)} s
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="render-preview" data-phase={status.phase}>
            {/* The canvas is inserted imperatively; React never renders into this holder. */}
            <div className="render-holder" ref={holder} />
            {status.phase === 'idle' && <div className="render-empty">The render appears here and sharpens as samples accumulate.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
