import { useState } from "react";
import { ModelViewport, type ViewMode } from "./ModelViewport";
import { stackSizing, stackFaces, modelBounds, type AirPath } from "./new-model";
import { stackThermal, thermalColorCss } from "./temperature-model";

const viewOptions: Array<{ id: ViewMode; label: string }> = [
  { id: "complete", label: "完整模型" },
  { id: "cutaway", label: "整体半剖" },
  { id: "crossSection", label: "横向剖视" },
  { id: "exploded", label: "分解视图" },
];

type FlowControlId = "all" | AirPath | "off";
const allFlows: AirPath[] = ["bypass", "supply", "reaction"];
const flowOptions: Array<{ id: FlowControlId; label: string; color: string }> = [
  { id: "all", label: "全部气流", color: "#315e6e" },
  { id: "bypass", label: "外涵推进", color: "#087ff5" },
  { id: "supply", label: "新鲜空气", color: "#0caf78" },
  { id: "reaction", label: "中间主流", color: "#e78218" },
  { id: "off", label: "隐藏气流", color: "#8ca1aa" },
];

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("cutaway");
  const [activeFlows, setActiveFlows] = useState<AirPath[]>([...allFlows]);
  const [flowSpeed, setFlowSpeed] = useState(1.25);
  const [fanRunning, setFanRunning] = useState(true);
  const [cutPosition, setCutPosition] = useState(0);
  const [crossCutPosition, setCrossCutPosition] = useState(stackFaces[1].front);
  const [explodeAmount, setExplodeAmount] = useState(0.65);
  const [temperatureMode, setTemperatureMode] = useState(true);

  const toggleFlow = (id: FlowControlId) => {
    if (id === "all") {
      setActiveFlows([...allFlows]);
      return;
    }
    if (id === "off") {
      setActiveFlows([]);
      return;
    }
    setActiveFlows(current => current.includes(id)
      ? current.filter(flow => flow !== id)
      : [...current, id]);
  };

  const flowControlActive = (id: FlowControlId) => id === "all"
    ? activeFlows.length === allFlows.length
    : id === "off"
      ? activeFlows.length === 0
      : activeFlows.includes(id);

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow"><span /> FLOW VISUALIZATION / THREE-STAGE CONFIGURATION</div>
          <h1>环形燃料电池推进器</h1>
        </div>
        <div className="status-badges">
          <span>主风扇 Ø1000 · 三级电堆 Ø422 / Ø466 / Ø510</span>
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
              activeFlows={activeFlows}
              flowSpeed={flowSpeed}
              fanRunning={fanRunning}
              cutPosition={cutPosition}
              crossCutPosition={crossCutPosition}
              explodeAmount={explodeAmount}
              temperatureMode={temperatureMode}
            />
          </div>
          <section className="panel sizing-panel">
            <h2>三级电堆尺寸</h2>
            <table className="sizing-table">
              <thead><tr><th>级</th><th>外径 mm</th><th>有效径长 mm</th><th>有效轴长 mm</th><th>单片面积 cm²</th><th>片数</th></tr></thead>
              <tbody>{stackSizing.map((stack, index) => <tr key={index}>
                <td>{index + 1}</td><td>Ø{stack.outerDiameter}</td><td>{stack.activeRadial}</td><td>{stack.activeAxial}</td><td>{(stack.activeRadial * stack.activeAxial / 100).toFixed(1)}</td><td>{stack.cells}</td>
              </tr>)}</tbody>
            </table>
            <p className="panel-copy">内孔 Ø150 mm；每级前端均设环形引气口。轴长为单片有效长度，两端各保留 2 mm 端板。</p>
          </section>
        </section>

        <aside className="side-panel">
          <section className="panel">
            <h2>显示模式</h2>
            <div className="display-modes" role="group" aria-label="显示模式">
              <button className={!temperatureMode ? "active" : ""} onClick={() => setTemperatureMode(false)} aria-pressed={!temperatureMode}>流路模式</button>
              <button className={temperatureMode ? "active" : ""} onClick={() => { setTemperatureMode(true); if (viewMode === "exploded") setViewMode("cutaway"); setActiveFlows([...allFlows]); }} aria-pressed={temperatureMode}>温度模式</button>
            </div>
          </section>

          {temperatureMode && <section className="panel thermal-panel">
            <h2>三级电堆温度</h2>
            <p className="panel-copy">各级电堆按 55℃ 设定显示。气流颜色区分流路。</p>
            <table className="sizing-table thermal-table">
              <thead><tr><th>电堆</th><th>引气结构</th><th>设定温度</th></tr></thead>
              <tbody>{stackThermal.map((stack, index) => <tr key={index}>
                <td>{index + 1}</td>
                <td>全环引气</td>
                <td><span className="thermal-dot" style={{ background: thermalColorCss(stack.meanC) }} />{stack.meanC.toFixed(0)}℃</td>
              </tr>)}</tbody>
            </table>
          </section>}

          <section className="panel">
            <h2>观察方式</h2>
            {viewMode === "cutaway" && <label className="control">
              <span><b>统一纵剖位置</b><output>{cutPosition === 0 ? "正中半剖" : `${Math.round(cutPosition / 180 * 100)}%`}</output></span>
              <input type="range" min={-180} max={180} step={5} value={cutPosition} onChange={event => setCutPosition(Number(event.target.value))} />
              <small><i>背侧</i><i>正中</i><i>前侧</i></small>
            </label>}
            {viewMode === "crossSection" && <label className="control">
              <span><b>横向剖切位置</b><output>X = {crossCutPosition} mm</output></span>
              <input type="range" min={-350} max={Math.floor(modelBounds.maxX / 10) * 10} step={1} value={crossCutPosition} onChange={event => setCrossCutPosition(Number(event.target.value))} />
              <small><i>前风扇</i><i>电堆中段</i><i>尾部</i></small>
              <p>剖切面垂直于推进轴，保留剖切位置朝尾部一侧的结构；观察方向为前风扇→尾部。</p>
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
                <button key={option.id} className={`${flowControlActive(option.id) ? "active" : ""} ${option.id === "off" ? "wide" : ""}`} onClick={() => toggleFlow(option.id)} aria-pressed={flowControlActive(option.id)}>
                  <span style={{ background: option.color }} />{option.label}
                </button>
              ))}
            </div>
            <label className="control compact">
              <span><b>流动速度</b><output>{flowSpeed.toFixed(2)}×</output></span>
              <input type="range" min={0.25} max={2} step={0.05} value={flowSpeed} onChange={event => setFlowSpeed(Number(event.target.value))} />
            </label>
            <div className="switch-row">
              <div><b>风扇旋转</b><small>主推进风扇与环道外缘转子</small></div>
              <button className={`switch ${fanRunning ? "on" : ""}`} onClick={() => setFanRunning(value => !value)} aria-pressed={fanRunning}><i /></button>
            </div>
          </section>

        </aside>
      </div>
    </main>
  );
}
