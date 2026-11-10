import { useState, type CSSProperties } from 'react';
import { Box, Layers, MousePointer2, RotateCcw, SlidersHorizontal } from 'lucide-react';
import ModelViewport, { type CameraView, type IntakePose } from './ModelViewport';
import './styles.css';

type VisibilityKey = 'outerShell' | 'variableIntake' | 'interstageGuide' | 'intake' | 'intakeInner' | 'compressorCase' | 'stacks' | 'air' | 'hydrogen' | 'return' | 'cathodeWater' | 'anodeSeparator' | 'wiring';
type Visibility = Record<VisibilityKey, boolean>;
const neutralIntake: IntakePose = { opening: .55, pitchDeg: 0, yawDeg: 0 };

const initialVisibility: Visibility = {
  outerShell: true,
  variableIntake: true,
  interstageGuide: true,
  intake: true,
  intakeInner: true,
  compressorCase: true,
  stacks: true,
  air: true,
  hydrogen: true,
  return: true,
  cathodeWater: true,
  anodeSeparator: true,
  wiring: true,
};

function IntakeControl({ stage, pose, onChange, onInspect }: {
  stage: 2 | 3; pose: IntakePose;
  onChange: (pose: IntakePose) => void; onInspect: () => void;
}) {
  const name = stage === 2 ? '二级进气罩' : '三级进气罩';
  const sliders: { key: keyof IntakePose; label: string; value: number; min: number; max: number; step: number; unit: string }[] = [
    { key: 'opening', label: '开度', value: Math.round(pose.opening * 100), min: 0, max: 100, step: 1, unit: '%' },
    { key: 'pitchDeg', label: '上下偏转', value: pose.pitchDeg, min: -5, max: 5, step: .25, unit: '°' },
    { key: 'yawDeg', label: '左右偏转', value: pose.yawDeg, min: -5, max: 5, step: .25, unit: '°' },
  ];
  return <div className="intake-control" data-stage={stage}>
    <div className="intake-control-heading">
      <button type="button" className="intake-inspect" onClick={onInspect} aria-label={`查看${name}`}>{name}</button>
      <button type="button" className="intake-reset" onClick={() => onChange({ ...neutralIntake })} aria-label={`复位${name}`}>
        <RotateCcw size={12} /><span>复位</span>
      </button>
    </div>
    {sliders.map(slider => {
      const id = `intake-${stage}-${slider.key}`;
      const progress = (slider.value - slider.min) / (slider.max - slider.min) * 100;
      const text = slider.key === 'opening' ? String(slider.value) : `${slider.value > 0 ? '+' : ''}${slider.value}`;
      return <div className="intake-slider-row" key={slider.key}>
        <div className="depth-heading"><label htmlFor={id}>{slider.label}</label><output htmlFor={id}>{text}<span>{slider.unit}</span></output></div>
        <input id={id} className="depth-slider" type="range" min={slider.min} max={slider.max} step={slider.step}
          aria-label={`${name}${slider.label}`} aria-valuetext={`${text}${slider.unit}`} value={slider.value}
          style={{ '--section-progress': `${progress}%` } as CSSProperties}
          onChange={event => onChange({ ...pose, [slider.key]: Number(event.currentTarget.value) / (slider.key === 'opening' ? 100 : 1) })} />
      </div>;
    })}
  </div>;
}

function LayerToggle({ label, color, checked, onChange }: {
  label: string;
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
      </span>
      <span className="toggle-track" aria-hidden="true"><span /></span>
    </button>
  );
}

export default function App() {
  const [viewMode, setViewMode] = useState<'complete' | 'cutaway'>('cutaway');
  const [sectionDepth, setSectionDepth] = useState(50);
  const [cameraView, setCameraView] = useState<CameraView>('perspective');
  const [compressorView, setCompressorView] = useState<'passage' | 'rotors'>('passage');
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [intake2, setIntake2] = useState<IntakePose>({ ...neutralIntake });
  const [intake3, setIntake3] = useState<IntakePose>({ ...neutralIntake });
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
    // An off-centre cut exposes the schematic tapered stack laminations;
    // the water view retains both separators on opposite sides of the core.
    if (view === 'cells' || view === 'water') {
      setViewMode('cutaway');
      setSectionDepth(view === 'cells' ? 45 : 37);
    }
    if (view === 'compressor') {
      setViewMode('cutaway');
      setSectionDepth(50);
      setCompressorView('passage');
    }
    if (view === 'intake2' || view === 'intake3') {
      setViewMode('complete');
      setVisibility(current => ({ ...current, variableIntake: true }));
    }
    if (view === 'stage1Pipes') {
      setVisibility(current => ({ ...current, stacks: true, air: true, hydrogen: true, return: true, cathodeWater: true }));
    }
    // Reapply a preset even after the user has manually orbited away from it.
    setResetKey(current => current + 1);
  };

  return (
    <div className="design-app">
      <header className="site-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><Box size={24} strokeWidth={1.5} /></div>
          <div>
            <h1>氢能燃料电池发动机</h1>
          </div>
        </div>
        <div className="header-note"><span aria-hidden="true" />凸台电堆方案</div>
      </header>

      <main className="design-workspace">
        <section className="viewer-card" aria-label="推进构型三维模型">
          <div className="viewer-heading">
            <div className="viewer-caption"><span className="caption-dot" />{cameraView === 'compressor' ? '离心式压气机' : cameraView === 'intake2' ? '二级可变进气罩' : cameraView === 'intake3' ? '三级可变进气罩' : cameraView === 'stage1Pipes' ? '一级电堆与管路' : cameraView === 'cells' ? '凸台 / 叠层' : '凸台电堆方案'}</div>
            <div className="viewer-mode">{cameraView === 'stage1Pipes' ? '电堆半剖 · 管路完整' : cameraView === 'compressor' && compressorView === 'rotors' ? '叶轮与静叶' : viewMode === 'cutaway' ? '剖切视图' : '完整视图'}</div>
          </div>

          <div className="viewer-scene">
            <ModelViewport
              viewMode={viewMode}
              sectionDepth={sectionDepth}
              cameraView={cameraView}
              compressorView={compressorView}
              showOuterShell={visibility.outerShell}
              showVariableIntake={visibility.variableIntake}
              showInterstageGuide={visibility.interstageGuide}
              showIntake={visibility.intake}
              showIntakeInner={visibility.intakeInner}
              showCompressorCase={visibility.compressorCase}
              showStacks={visibility.stacks}
              showAir={visibility.air}
              showHydrogen={visibility.hydrogen}
              showReturn={visibility.return}
              showCathodeWater={visibility.cathodeWater}
              showAnodeSeparator={visibility.anodeSeparator}
              showWiring={visibility.wiring}
              intake2={intake2}
              intake3={intake3}
              resetKey={resetKey}
            />
            {cameraView === 'compressor' && <div className="compressor-inspector">
              <div className="compressor-modes" role="group" aria-label="压气机细节">
                <button type="button" className={compressorView === 'passage' ? 'is-active' : ''}
                  aria-pressed={compressorView === 'passage'} onClick={() => { setCompressorView('passage'); setViewMode('cutaway'); setSectionDepth(50); }}>流道剖面</button>
                <button type="button" className={compressorView === 'rotors' ? 'is-active' : ''}
                  aria-pressed={compressorView === 'rotors'} onClick={() => setCompressorView('rotors')}>叶轮与静叶</button>
              </div>
            </div>}
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
                  aria-pressed={cameraView === 'machinery'} onClick={() => selectCamera('machinery')}>前端总成</button>
                <button type="button" className={cameraView === 'compressor' ? 'is-active' : ''}
                  aria-pressed={cameraView === 'compressor'} onClick={() => selectCamera('compressor')}>压气机通道</button>
                <button type="button" className={cameraView === 'intake2' ? 'is-active' : ''}
                  aria-pressed={cameraView === 'intake2'} onClick={() => selectCamera('intake2')}>二级进气罩</button>
                <button type="button" className={cameraView === 'intake3' ? 'is-active' : ''}
                  aria-pressed={cameraView === 'intake3'} onClick={() => selectCamera('intake3')}>三级进气罩</button>
                <button type="button" className={cameraView === 'stacks' ? 'is-active' : ''}
                  aria-pressed={cameraView === 'stacks'} onClick={() => selectCamera('stacks')}>电堆</button>
                <button type="button" className={cameraView === 'stage1Pipes' ? 'is-active' : ''}
                  aria-pressed={cameraView === 'stage1Pipes'} onClick={() => selectCamera('stage1Pipes')}>一级电堆与管路</button>
                <button type="button" className={cameraView === 'cells' ? 'is-active' : ''}
                  aria-pressed={cameraView === 'cells'} onClick={() => selectCamera('cells')}>凸台 / 叠层</button>
                <button type="button" className={cameraView === 'water' ? 'is-active' : ''}
                  aria-pressed={cameraView === 'water'} onClick={() => selectCamera('water')}>水管理</button>
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

          {cameraView !== 'stage1Pipes' && <section className="control-section view-section" aria-labelledby="view-label">
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
            {viewMode === 'cutaway' && !(cameraView === 'compressor' && compressorView === 'rotors') && (
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
                  aria-describedby="section-depth-limits"
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
              </div>
            )}
          </section>}

          <section className="control-section intake-section" aria-labelledby="intake-label">
            <h3 id="intake-label">可变进气罩</h3>
            <div className="intake-control-grid">
              <IntakeControl stage={2} pose={intake2} onChange={setIntake2} onInspect={() => selectCamera('intake2')} />
              <IntakeControl stage={3} pose={intake3} onChange={setIntake3} onInspect={() => selectCamera('intake3')} />
            </div>
          </section>

          <section className="control-section structure-section" aria-labelledby="structure-label">
            <h3 id="structure-label">结构部件</h3>
            <div className="layer-list">
              <LayerToggle label="外壳" color="swatch-outer" checked={visibility.outerShell} onChange={() => toggleLayer('outerShell')} />
              <LayerToggle label="可变进气罩" color="swatch-variable" checked={visibility.variableIntake} onChange={() => toggleLayer('variableIntake')} />
              <LayerToggle label="级间导流罩" color="swatch-inner" checked={visibility.interstageGuide} onChange={() => toggleLayer('interstageGuide')} />
              <LayerToggle label="引气外筒" color="swatch-intake" checked={visibility.intake} onChange={() => toggleLayer('intake')} />
              <LayerToggle label="引气内筒" color="swatch-intake-inner" checked={visibility.intakeInner} onChange={() => toggleLayer('intakeInner')} />
              <LayerToggle label="黄色压气机外壳" color="swatch-compressor" checked={visibility.compressorCase} onChange={() => toggleLayer('compressorCase')} />
              <LayerToggle label="凸台电堆" color="swatch-stack" checked={visibility.stacks} onChange={() => toggleLayer('stacks')} />
            </div>
          </section>

          <section className="control-section pipe-section" aria-labelledby="pipe-label">
            <h3 id="pipe-label">管路系统</h3>
            <div className="layer-list">
              <LayerToggle label="空气管路" color="swatch-air" checked={visibility.air} onChange={() => toggleLayer('air')} />
              <LayerToggle label="供氢管路" color="swatch-hydrogen" checked={visibility.hydrogen} onChange={() => toggleLayer('hydrogen')} />
              <LayerToggle label="回氢管路" color="swatch-return" checked={visibility.return} onChange={() => toggleLayer('return')} />
              <LayerToggle label="阴极尾气与排水" color="swatch-inner" checked={visibility.cathodeWater} onChange={() => toggleLayer('cathodeWater')} />
              <LayerToggle label="阳极气水分离器" color="swatch-return" checked={visibility.anodeSeparator} onChange={() => toggleLayer('anodeSeparator')} />
              <LayerToggle label="电气线束" color="swatch-stack" checked={visibility.wiring} onChange={() => toggleLayer('wiring')} />
            </div>
          </section>

        </aside>
      </main>
    </div>
  );
}
