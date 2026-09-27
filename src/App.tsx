import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore } from './store/store';
import Toolbar, { TOOL_KEYS } from './ui/Toolbar';
import PlanView from './plan/PlanView';
import CatalogPanel from './ui/CatalogPanel';
import PropertiesPanel from './ui/PropertiesPanel';
import ProjectPanel from './ui/ProjectPanel';
import SchedulePanel from './ui/SchedulePanel';
import { mittHusTemplate } from './model/mittHus';
import RenderDialog from './ui/RenderDialog';
import type { ToolId } from './store/store';

const Scene3D = lazy(() => import('./three/Scene3D'));

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.defaultPrevented) return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && k === 'c') return s.copySelection();
      if (mod && k === 'v') return s.paste();
      if (mod && k === 'd') {
        e.preventDefault();
        return s.duplicateSelection();
      }
      if (mod && k === 'a') {
        e.preventDefault();
        const lv = s.activeLevelId;
        const p = s.project;
        s.setSelection([
          ...p.walls.filter((w) => w.levelId === lv).map((w) => ({ type: 'wall' as const, id: w.id })),
          ...p.items.filter((w) => w.levelId === lv).map((w) => ({ type: 'item' as const, id: w.id })),
          ...p.rooms.filter((w) => w.levelId === lv).map((w) => ({ type: 'room' as const, id: w.id })),
        ]);
        return;
      }
      if (mod) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        return s.deleteSelection();
      }
      if (e.key.startsWith('Arrow') && s.selection.length && !s.options.walkMode) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const d = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } }[e.key]!;
        return s.moveSelection(d);
      }
      if (s.options.walkMode) return;
      if (k === 'r' && !s.placing) {
        const ids = new Set(s.selection.filter((x) => x.type === 'item').map((x) => x.id));
        if (ids.size)
          s.mutate((d) => {
            for (const i of d.items) if (ids.has(i.id) && !i.locked) i.rotation = (i.rotation + (e.shiftKey ? 15 : 90)) % 360;
          });
        return;
      }
      if (k === 'd') return s.setPlacing({ type: 'opening', kind: 'door' });
      if (k === 'n') return s.setPlacing({ type: 'opening', kind: 'window' });
      const tool = TOOL_KEYS[k] as ToolId | undefined;
      if (tool) s.setTool(tool);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  const view = useStore((s) => s.view);
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const project = useStore((s) => s.project);
  const levels = project.levels;
  const activeLevelId = useStore((s) => s.activeLevelId);
  const setActiveLevel = useStore((s) => s.setActiveLevel);
  const [error, setError] = useState<string | null>(null);
  useShortcuts();

  // First run: open the sample house so there is something to explore.
  useEffect(() => {
    const s = useStore.getState();
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('home-designer:project');
    } catch {
      /* storage unavailable (private mode, sandboxed page) */
    }
    if (!saved && s.project.walls.length === 0) s.loadProject(mittHusTemplate());
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <div className="app">
      <Toolbar onError={setError} />
      <div className="main">
        <aside className="sidebar left">
          <div className="tabs">
            {(['catalog', 'project', 'schedule'] as const).map((p) => (
              <button key={p} className={panel === p ? 'active' : ''} onClick={() => setPanel(p)}>
                {p === 'catalog' ? 'Catalog' : p === 'project' ? 'Project & levels' : 'Schedule'}
              </button>
            ))}
          </div>
          <div className="sidebar-body">
            {panel === 'catalog' && <CatalogPanel />}
            {panel === 'project' && <ProjectPanel />}
            {panel === 'schedule' && <SchedulePanel />}
          </div>
        </aside>
        <main className={`views ${view}`}>
          <div className="level-tabs">
            {[...levels]
              .sort((a, b) => a.elevation - b.elevation)
              .map((l) => (
                <button key={l.id} className={l.id === activeLevelId ? 'active' : ''} onClick={() => setActiveLevel(l.id)}>
                  {l.name}
                </button>
              ))}
          </div>
          {view !== '3d' && (
            <div className="pane">
              <PlanView />
            </div>
          )}
          {view !== '2d' && (
            <div className="pane">
              <Suspense fallback={<div className="loading">Loading 3D…</div>}>
                <Scene3D />
              </Suspense>
            </div>
          )}
        </main>
        <aside className="sidebar right">
          <div className="sidebar-title">Properties</div>
          <div className="sidebar-body">
            <PropertiesPanel />
          </div>
        </aside>
      </div>
      <RenderDialog />
      {error && <div className="toast">{error}</div>}
    </div>
  );
}
