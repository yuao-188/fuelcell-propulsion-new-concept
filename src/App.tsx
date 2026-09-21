import { useState } from "react";
import { ModelViewport, type FlowMode, type ViewMode } from "./ModelViewport";
import { stackSizing } from "./new-model";
import { motorThermal, stackThermal, thermalColorCss } from "./temperature-model";

const viewOptions: Array<{ id: ViewMode; label: string }> = [
  { id: "complete", label: "完整模型" },
  { id: "cutaway", label: "整体半剖" },
  { id: "exploded", label: "分解视图" },
];

const flowOptions: Array<{ id: FlowMode; label: string; color: string }> = [
  { id: "all", label: "全部气流", color: "#315e6e" },
  { id: "bypass", label: "外涵推进", color: "#087ff5" },
  { id: "supply", label: "新鲜空气", color: "#0caf78" },
  { id: "reaction", label: "中间主流", color: "#e78218" },
  { id: "off", label: "隐藏气流", color: "#8ca1aa" },
];

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("cutaway");
  const [flowMode, setFlowMode] = useState<FlowMode>("all");
  const [flowSpeed, setFlowSpeed] = useState(1.25);
  const [fanRunning, setFanRunning] = useState(true);
  const [cutPosition, setCutPosition] = useState(0);
  const [explodeAmount, setExplodeAmount] = useState(0.65);
  const [temperatureMode, setTemperatureMode] = useState(true);

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow"><span /> FLOW VISUALIZATION / 215-CELL GEOMETRY REVISION</div>
          <h1>环形燃料电池推进器</h1>
        </div>
        <div className="status-badges">
          <span>主风扇 Ø1000 · 六堆 Ø350—Ø590</span>
        </div>
      </header>

      <div className="workspace">
        <section className="viewer-column">
          <div className="toolbar">
            <div className="segmented" role="group" aria-label="观察模式">
              {viewOptions.map(option => (
                <button key={option.id} className={viewMode === option.id ? "active" : ""} onClick={() => setViewMode(option.id)}>{option.label}</button>
              ))}
            </div>
          </div>
          <div className="viewport-wrap">
            <ModelViewport
              viewMode={viewMode}
              flowMode={flowMode}
              flowSpeed={flowSpeed}
              fanRunning={fanRunning}
              cutPosition={cutPosition}
              explodeAmount={explodeAmount}
              temperatureMode={temperatureMode}
            />
          </div>
          <section className="panel sizing-panel">
            <h2>六级尺寸 · mm</h2>
            <table className="sizing-table">
              <thead><tr><th>级</th><th>外径</th><th>径高</th><th>轴长</th><th>片数</th></tr></thead>
              <tbody>{stackSizing.map((stack, index) => <tr key={index}>
                <td>{index + 1}</td><td>Ø{stack.outerDiameter}</td><td>{stack.activeRadial}</td><td>{stack.mechanicalAxial}</td><td>{stack.cells}</td>
              </tr>)}</tbody>
            </table>
          </section>
        </section>

        <aside className="side-panel">
          <section className="panel">
            <h2>显示模式</h2>
            <div className="display-modes" role="group" aria-label="显示模式">
              <button className={!temperatureMode ? "active" : ""} onClick={() => setTemperatureMode(false)} aria-pressed={!temperatureMode}>流路模式</button>
              <button className={temperatureMode ? "active" : ""} onClick={() => { setTemperatureMode(true); setViewMode("cutaway"); setFlowMode("all"); }} aria-pressed={temperatureMode}>温度模式</button>
            </div>
          </section>

          {temperatureMode && <section className="panel thermal-panel">
            <h2>巡航条件温度 · 6000 m / 30 m/s</h2>
            <p className="panel-copy">按选定的 75 kW 条件解显示。彩色粒子表示沿程估算气温；电堆颜色表示等效平均堆温，不代表局部热点。</p>
            <table className="sizing-table thermal-table">
              <thead><tr><th>堆</th><th>电功率</th><th>风量</th><th>气温 进→出</th><th>堆温</th></tr></thead>
              <tbody>{stackThermal.map((stack, index) => <tr key={index}>
                <td>{index + 1}</td>
                <td>{stack.powerKw.toFixed(1)} kW</td>
                <td>{stack.flowKgS.toFixed(2)}</td>
                <td>{stack.inletC.toFixed(1)}→{stack.outletC.toFixed(1)}°</td>
                <td><span className="thermal-dot" style={{ background: thermalColorCss(stack.meanC) }} />{stack.meanC.toFixed(1)}°</td>
              </tr>)}</tbody>
            </table>
            <p className="thermal-subhead">电机壳体条件估算</p>
            <div className="motor-temperatures">{motorThermal.map(motor => <div key={motor.label}>
              <span><i className="thermal-dot" style={{ background: thermalColorCss(motor.shellC) }} />{motor.label}</span>
              <b>≈{motor.shellC.toFixed(0)}°C</b>
            </div>)}</div>
          </section>}

          <section className="panel">
            <h2>观察方式</h2>
            {viewMode === "cutaway" && <label className="control">
              <span><b>统一纵剖位置</b><output>{cutPosition === 0 ? "正中半剖" : `${Math.round(cutPosition / 180 * 100)}%`}</output></span>
              <input type="range" min={-180} max={180} step={5} value={cutPosition} onChange={event => setCutPosition(Number(event.target.value))} />
              <small><i>背侧</i><i>正中</i><i>前侧</i></small>
            </label>}
            {viewMode === "exploded" && <label className="control">
              <span><b>轴向分离程度</b><output>{Math.round(explodeAmount * 100)}%</output></span>
              <input type="range" min={0.15} max={1} step={0.05} value={explodeAmount} onChange={event => setExplodeAmount(Number(event.target.value))} />
              <p>各部件沿共同轴线依次排列，气流自动隐藏。</p>
            </label>}
            {viewMode === "complete" && <p className="panel-copy">观察直筒式前机匣、无外壳的后段推进流、环道与尾部。</p>}
          </section>

          <section className="panel">
            <h2>气流显示</h2>
            <div className="flow-grid" role="group" aria-label="气流类型">
              {flowOptions.map(option => (
                <button key={option.id} className={`${flowMode === option.id ? "active" : ""} ${option.id === "off" ? "wide" : ""}`} onClick={() => setFlowMode(option.id)}>
                  <span style={{ background: option.color }} />{option.label}
                </button>
              ))}
            </div>
            <label className="control compact">
              <span><b>流动速度</b><output>{flowSpeed.toFixed(2)}×</output></span>
              <input type="range" min={0.25} max={2} step={0.05} value={flowSpeed} onChange={event => setFlowSpeed(Number(event.target.value))} />
            </label>
            <div className="switch-row">
              <div><b>风扇旋转</b><small>主风扇、环道外缘转子与两级区间增压风扇</small></div>
              <button className={`switch ${fanRunning ? "on" : ""}`} onClick={() => setFanRunning(value => !value)} aria-pressed={fanRunning}><i /></button>
            </div>
          </section>

        </aside>
      </div>
    </main>
  );
}
