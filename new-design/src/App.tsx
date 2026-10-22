import { useState, type CSSProperties } from 'react';
import { Box, Layers, MousePointer2, RotateCcw, SlidersHorizontal } from 'lucide-react';
import ModelViewport from './ModelViewport';
import './styles.css';

type VisibilityKey = 'outerShell' | 'innerShell' | 'intake' | 'intakeInner' | 'compressorCase' | 'stacks' | 'air' | 'hydrogen' | 'return';
type Visibility = Record<VisibilityKey, boolean>;
type CameraView = 'perspective' | 'side' | 'front' | 'fan' | 'machinery' | 'stacks';

const initialVisibility: Visibility = {
  outerShell: true,
  innerShell: true,
  intake: true,
  intakeInner: true,
  compressorCase: true,
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
  const [sectionDepth, setSectionDepth] = useState(50);
  const [cameraView, setCameraView] = useState<CameraView>('perspective');
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [resetKey, setResetKey] = useState(0);

  const toggleLayer = (layer: VisibilityKey) => {
    setVisibility(current => ({ ...current, [layer]: !current[layer] }));
  };

  const resetView = () => {
    setCameraView('perspective');
    setResetKey(current => current + 1);
  };

  const selectCamera = (view: CameraView) => {
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
        <div className="header-note"><span aria-hidden="true" />几何模型 · 结构与管路布局</div>
      </header>

      <main className="design-workspace">
        <section className="viewer-card" aria-label="推进构型三维模型">
          <div className="viewer-heading">
            <div className="viewer-caption"><span className="caption-dot" />整体构型</div>
            <div className="viewer-mode">{viewMode === 'cutaway' ? '剖切视图' : '完整视图'}</div>
          </div>

          <div className="viewer-scene">
            <ModelViewport
              viewMode={viewMode}
              sectionDepth={sectionDepth}
              cameraView={cameraView}
              showOuterShell={visibility.outerShell}
              showInnerShell={visibility.innerShell}
              showIntake={visibility.intake}
              showIntakeInner={visibility.intakeInner}
              showCompressorCase={visibility.compressorCase}
              showStacks={visibility.stacks}
              showAir={visibility.air}
              showHydrogen={visibility.hydrogen}
              showReturn={visibility.return}
              resetKey={resetKey}
            />
          </div>

          <div className="viewer-bottom">
            <div className="viewer-controls">
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
              <div className="detail-toolbar" role="group" aria-label="局部查看">
                <span className="detail-toolbar-label">局部查看</span>
                <button type="button" className={cameraView === 'fan' ? 'is-active' : ''}
                  aria-pressed={cameraView === 'fan'} onClick={() => selectCamera('fan')}>风扇</button>
                <button type="button" className={cameraView === 'machinery' ? 'is-active' : ''}
                  aria-pressed={cameraView === 'machinery'} onClick={() => selectCamera('machinery')}>电机 / 增压机</button>
                <button type="button" className={cameraView === 'stacks' ? 'is-active' : ''}
                  aria-pressed={cameraView === 'stacks'} onClick={() => selectCamera('stacks')}>电堆</button>
              </div>
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
                <Layers size={16} strokeWidth={1.6} />剖切
              </button>
            </div>
            {viewMode === 'cutaway' && (
              <div className="depth-control">
                <div className="depth-heading">
                  <label htmlFor="section-depth">剖切深度</label>
                  <output htmlFor="section-depth">{sectionDepth}<span>%</span></output>
                </div>
                <input
                  id="section-depth"
                  className="depth-slider"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={sectionDepth}
                  aria-valuetext={`${sectionDepth}% 剖切深度`}
                  aria-describedby="section-depth-limits section-depth-scope"
                  style={{ '--section-progress': `${sectionDepth}%` } as CSSProperties}
                  onChange={event => setSectionDepth(Number(event.currentTarget.value))}
                />
                <div className="depth-limits" id="section-depth-limits">
                  <span>完整保留</span><span>全剖开</span>
                </div>
                <div className="depth-presets" role="group" aria-label="常用剖切深度">
                  {[25, 50, 75].map(depth => (
                    <button key={depth} type="button" className={sectionDepth === depth ? 'is-active' : ''}
                      aria-pressed={sectionDepth === depth} onClick={() => setSectionDepth(depth)}>
                      {depth}%
                    </button>
                  ))}
                </div>
                <p className="depth-scope" id="section-depth-scope">沿轴向平面剖切壳体与电堆</p>
              </div>
            )}
          </section>

          <section className="control-section structure-section" aria-labelledby="structure-label">
            <h3 id="structure-label">结构部件</h3>
            <div className="layer-list">
              <LayerToggle label="外壳" color="swatch-outer" checked={visibility.outerShell} onChange={() => toggleLayer('outerShell')} />
              <LayerToggle label="整机内壳" detail="水平延伸 · 连续渐扩与收缩" color="swatch-inner" checked={visibility.innerShell} onChange={() => toggleLayer('innerShell')} />
              <LayerToggle label="引气外筒" detail="内外筒之间形成环形引气道" color="swatch-intake" checked={visibility.intake} onChange={() => toggleLayer('intake')} />
              <LayerToggle label="引气内筒" detail="包围电机 · 前后均开口" color="swatch-intake-inner" checked={visibility.intakeInner} onChange={() => toggleLayer('intakeInner')} />
              <LayerToggle label="黄色压气机外壳" detail="隐藏后查看叶轮与内部导流罩" color="swatch-compressor" checked={visibility.compressorCase} onChange={() => toggleLayer('compressorCase')} />
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
            <details className="dimension-report">
              <summary>报告尺寸 <span>/ mm</span></summary>
              <table>
                <caption>电堆：内径 / 外径 × 轴向长</caption>
                <tbody>
                  <tr><th scope="row">整机长</th><td>2012</td></tr>
                  <tr><th scope="row">风扇段内径</th><td>Φ1000</td></tr>
                  <tr><th scope="row">主电机</th><td>Φ300 × 193</td></tr>
                  <tr><th scope="row">第一级</th><td>Φ160 / Φ351 × 282</td></tr>
                  <tr><th scope="row">第二级</th><td>Φ301 / Φ434 × 375</td></tr>
                  <tr><th scope="row">第三级</th><td>Φ384 / Φ496 × 375</td></tr>
                </tbody>
              </table>
            </details>
            <p className="scale-note">主机与电堆尺寸按构型报告<br />引气与机匣按新示意调整，装配细节为示意</p>
          </section>
        </aside>
      </main>
    </div>
  );
}
