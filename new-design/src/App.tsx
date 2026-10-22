import { useState } from 'react';
import { Box, Layers, MousePointer2, RotateCcw, SlidersHorizontal } from 'lucide-react';
import ModelViewport from './ModelViewport';
import './styles.css';

type VisibilityKey = 'outerShell' | 'innerShell' | 'stacks' | 'air' | 'hydrogen' | 'return';
type Visibility = Record<VisibilityKey, boolean>;

const initialVisibility: Visibility = {
  outerShell: true,
  innerShell: true,
  stacks: true,
  air: true,
  hydrogen: true,
  return: true,
};

function LayerToggle({ label, detail, color, checked, onChange }: {
  label: string;
  detail?: string;
  color: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      className={`layer-toggle${checked ? ' is-visible' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label}显示`}
      onClick={onChange}
    >
      <span className={`layer-swatch ${color}`} aria-hidden="true" />
      <span className="layer-copy">
        <span className="layer-label">{label}</span>
        {detail && <span className="layer-detail">{detail}</span>}
      </span>
      <span className="toggle-track" aria-hidden="true"><span /></span>
    </button>
  );
}

export default function App() {
  const [viewMode, setViewMode] = useState<'complete' | 'cutaway'>('cutaway');
  const [cameraView, setCameraView] = useState<'perspective' | 'side' | 'front'>('perspective');
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [resetKey, setResetKey] = useState(0);

  const toggleLayer = (layer: VisibilityKey) => {
    setVisibility(current => ({ ...current, [layer]: !current[layer] }));
  };

  const resetView = () => {
    setCameraView('perspective');
    setResetKey(current => current + 1);
  };

  const selectCamera = (view: 'perspective' | 'side' | 'front') => {
    setCameraView(view);
    // Reapply a preset even after the user has manually orbited away from it.
    setResetKey(current => current + 1);
  };

  return (
    <div className="design-app">
      <header className="site-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><Box size={24} strokeWidth={1.5} /></div>
          <div>
            <p className="brand-kicker">燃料电池电推进 · 独立方案</p>
            <h1>模块化推进构型</h1>
          </div>
        </div>
        <div className="header-note"><span aria-hidden="true" />实体结构与管路布局</div>
      </header>

      <main className="design-workspace">
        <section className="viewer-card" aria-label="推进构型三维模型">
          <div className="viewer-heading">
            <div className="viewer-caption"><span className="caption-dot" />整体构型</div>
            <div className="viewer-mode">{viewMode === 'cutaway' ? '半剖视图' : '完整视图'}</div>
          </div>

          <div className="viewer-scene">
            <ModelViewport
              viewMode={viewMode}
              cameraView={cameraView}
              showOuterShell={visibility.outerShell}
              showInnerShell={visibility.innerShell}
              showStacks={visibility.stacks}
              showAir={visibility.air}
              showHydrogen={visibility.hydrogen}
              showReturn={visibility.return}
              resetKey={resetKey}
            />
          </div>

          <div className="viewer-bottom">
            <div className="camera-toolbar" role="toolbar" aria-label="模型视角">
              <button type="button" className={cameraView === 'perspective' ? 'is-active' : ''}
                aria-pressed={cameraView === 'perspective'} onClick={() => selectCamera('perspective')}>立体</button>
              <button type="button" className={cameraView === 'side' ? 'is-active' : ''}
                aria-pressed={cameraView === 'side'} onClick={() => selectCamera('side')}>侧视</button>
              <button type="button" className={cameraView === 'front' ? 'is-active' : ''}
                aria-pressed={cameraView === 'front'} onClick={() => selectCamera('front')}>正视</button>
              <span className="toolbar-divider" aria-hidden="true" />
              <button className="reset-button" type="button" onClick={resetView} aria-label="复位视角">
                <RotateCcw size={15} strokeWidth={1.7} /><span>复位</span>
              </button>
            </div>
            <div className="viewer-hint"><MousePointer2 size={13} />拖动旋转 · 缩放查看</div>
          </div>
        </section>

        <aside className="control-panel" aria-label="模型显示控制">
          <div className="panel-heading">
            <SlidersHorizontal size={17} strokeWidth={1.7} />
            <h2>显示控制</h2>
          </div>

          <section className="control-section view-section" aria-labelledby="view-label">
            <h3 id="view-label">观察方式</h3>
            <div className="mode-selector" role="group" aria-label="模型剖切方式">
              <button type="button" className={viewMode === 'complete' ? 'is-active' : ''}
                aria-pressed={viewMode === 'complete'} onClick={() => setViewMode('complete')}>
                <Box size={16} strokeWidth={1.6} />完整
              </button>
              <button type="button" className={viewMode === 'cutaway' ? 'is-active' : ''}
                aria-pressed={viewMode === 'cutaway'} onClick={() => setViewMode('cutaway')}>
                <Layers size={16} strokeWidth={1.6} />半剖
              </button>
            </div>
          </section>

          <section className="control-section structure-section" aria-labelledby="structure-label">
            <h3 id="structure-label">结构部件</h3>
            <div className="layer-list">
              <LayerToggle label="外壳" color="swatch-outer" checked={visibility.outerShell} onChange={() => toggleLayer('outerShell')} />
              <LayerToggle label="内壳" color="swatch-inner" checked={visibility.innerShell} onChange={() => toggleLayer('innerShell')} />
              <LayerToggle label="电堆模块" detail="隐藏后可查看内部管路" color="swatch-stack" checked={visibility.stacks} onChange={() => toggleLayer('stacks')} />
            </div>
          </section>

          <section className="control-section pipe-section" aria-labelledby="pipe-label">
            <h3 id="pipe-label">管路系统<span className="section-note">独立显隐</span></h3>
            <div className="layer-list">
              <LayerToggle label="空气管路" color="swatch-air" checked={visibility.air} onChange={() => toggleLayer('air')} />
              <LayerToggle label="供氢管路" color="swatch-hydrogen" checked={visibility.hydrogen} onChange={() => toggleLayer('hydrogen')} />
              <LayerToggle label="回氢管路" color="swatch-return" checked={visibility.return} onChange={() => toggleLayer('return')} />
            </div>
          </section>

          <section className="module-section" aria-labelledby="module-label">
            <div className="module-heading"><h3 id="module-label">模块分组</h3><span>共 <strong>11</strong> 个模块</span></div>
            <div className="module-groups">
              {[3, 4, 4].map((count, index) => (
                <div className="module-group" key={index}>
                  <span className="group-number">{count}</span>
                  <span className="group-label">第 {index + 1} 组</span>
                </div>
              ))}
            </div>
            <p className="scale-note">示意比例 · 展示构型与管路的空间关系</p>
          </section>
        </aside>
      </main>
    </div>
  );
}
