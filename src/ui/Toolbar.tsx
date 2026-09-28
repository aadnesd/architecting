import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Columns2,
  DoorOpen,
  FileDown,
  FilePlus2,
  FolderOpen,
  Hand,
  Home,
  Image,
  LayoutPanelLeft,
  MousePointer2,
  PenLine,
  Printer,
  Redo2,
  Ruler,
  Save,
  Square,
  SquareDashed,
  Triangle,
  Type,
  Undo2,
  AppWindow,
  Sparkles,
} from 'lucide-react';
import { useStore, type ToolId, type ViewMode } from '../store/store';
import { TEMPLATES } from '../model/templates';
import { exportDAE, exportGLB, exportPlanSVG, exportRenderPNG, openProjectFile, printPlan, saveProjectFile } from '../io/files';

function Menu({ label, icon, children }: { label: string; icon: React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={`tb-btn ${open ? 'active' : ''}`} onClick={() => setOpen(!open)}>
        {icon}
        <span>{label}</span>
      </button>
      {open && <div className="menu-pop">{children(() => setOpen(false))}</div>}
    </div>
  );
}

const TOOLS: { id: ToolId; label: string; icon: React.ReactNode; key: string }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 size={17} />, key: 'V' },
  { id: 'wall', label: 'Wall', icon: <PenLine size={17} />, key: 'W' },
  { id: 'roomRect', label: 'Box room', icon: <Square size={17} />, key: 'B' },
  { id: 'room', label: 'Floor', icon: <SquareDashed size={17} />, key: 'F' },
  { id: 'roof', label: 'Roof', icon: <Triangle size={17} />, key: 'T' },
  { id: 'dimension', label: 'Measure', icon: <Ruler size={17} />, key: 'M' },
  { id: 'label', label: 'Text', icon: <Type size={17} />, key: 'X' },
  { id: 'pan', label: 'Pan', icon: <Hand size={17} />, key: 'H' },
];

export const TOOL_KEYS = Object.fromEntries(TOOLS.map((t) => [t.key.toLowerCase(), t.id]));

export default function Toolbar({ onError }: { onError: (msg: string) => void }) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const placing = useStore((s) => s.placing);
  const setPlacing = useStore((s) => s.setPlacing);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const project = useStore((s) => s.project);
  const loadProject = useStore((s) => s.loadProject);
  const levelId = useStore((s) => s.activeLevelId);
  const [armedTemplate, setArmedTemplate] = useState<string | null>(null);

  const guard = (fn: () => unknown) => {
    try {
      const r = fn();
      if (r instanceof Promise) r.catch((e) => onError(String(e?.message ?? e)));
    } catch (e) {
      onError(String((e as Error).message ?? e));
    }
  };

  const views: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: '2d', label: '2D plan', icon: <LayoutPanelLeft size={16} /> },
    { id: 'split', label: 'Split', icon: <Columns2 size={16} /> },
    { id: '3d', label: '3D', icon: <Box size={16} /> },
  ];

  return (
    <div className="toolbar">
      <div className="brand">
        <Home size={18} />
        <span>Home Designer</span>
      </div>
      <Menu label="File" icon={<FolderOpen size={16} />}>
        {(close) => (
          <>
            <div className="menu-title">New from template</div>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className={armedTemplate === t.id ? 'danger' : ''}
                onClick={() => {
                  // Two-step confirmation in the menu itself (browser dialogs are unavailable in some hosts).
                  if (project.walls.length + project.items.length === 0 || armedTemplate === t.id) {
                    close();
                    setArmedTemplate(null);
                    loadProject(t.build());
                  } else setArmedTemplate(t.id);
                }}
              >
                <FilePlus2 size={14} /> {armedTemplate === t.id ? `Replace current project? Click again` : t.name}
              </button>
            ))}
            <div className="menu-sep" />
            <button onClick={() => (close(), guard(() => openProjectFile().then(loadProject)))}>
              <FolderOpen size={14} /> Open project file…
            </button>
            <button onClick={() => (close(), guard(() => saveProjectFile(project)))}>
              <Save size={14} /> Save project file
            </button>
            <div className="menu-sep" />
            <div className="menu-title">Export</div>
            <button onClick={() => (close(), useStore.getState().view === '2d' ? onError('Switch to the 3D or split view to render') : useStore.getState().setRenderOpen(true))}>
              <Sparkles size={14} /> Photorealistic render…
            </button>
            <button onClick={() => (close(), guard(() => exportRenderPNG(project.name)))}>
              <Image size={14} /> 3D view screenshot (PNG)
            </button>
            <button onClick={() => (close(), guard(() => exportGLB(project.name)))}>
              <Box size={14} /> 3D model (GLB for Blender, Unreal…)
            </button>
            <button onClick={() => (close(), guard(() => exportDAE(project.name)))}>
              <Box size={14} /> 3D model for SketchUp (DAE)
            </button>
            <button onClick={() => (close(), guard(() => exportPlanSVG(project, levelId)))}>
              <FileDown size={14} /> Floor plan as SVG
            </button>
            <button onClick={() => (close(), guard(() => printPlan(project, levelId)))}>
              <Printer size={14} /> Print floor plan / PDF
            </button>
          </>
        )}
      </Menu>
      <div className="tb-group">
        <button className="tb-icon" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <Undo2 size={17} />
        </button>
        <button className="tb-icon" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={17} />
        </button>
      </div>
      <div className="tb-group tools">
        {TOOLS.map((t) => (
          <button key={t.id} className={`tb-tool ${tool === t.id && !placing ? 'active' : ''}`} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
        <button className={`tb-tool ${placing?.type === 'opening' && placing.kind === 'door' ? 'active' : ''}`} onClick={() => setPlacing({ type: 'opening', kind: 'door' })} title="Door (D)">
          <DoorOpen size={17} />
          <span>Door</span>
        </button>
        <button className={`tb-tool ${placing?.type === 'opening' && placing.kind === 'window' ? 'active' : ''}`} onClick={() => setPlacing({ type: 'opening', kind: 'window' })} title="Window (N)">
          <AppWindow size={17} />
          <span>Window</span>
        </button>
      </div>
      <div className="tb-spacer" />
      <div className="tb-group segmented">
        {views.map((v) => (
          <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)} title={v.label}>
            {v.icon}
            <span>{v.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
