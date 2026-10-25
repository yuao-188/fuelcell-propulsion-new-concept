# Windows 离线桌面版

这是网页模型的独立桌面封装。交付 ZIP 完整包含 Electron、Chromium、模型和网页资源。收件人在 Windows 10/11 64位系统上完整解压后，双击“氢能燃料电池发动机.exe”即可使用，不需要安装 Node.js 或联网。

本地资源通过 `propulsion://app/` 只读协议加载。窗口不开放 Node.js，启用上下文隔离及沙箱；网络请求、外部导航和新窗口均被禁止。未配置自动更新或远端网页入口。

## 开发与打包

仅构建电脑需要 Node.js。依赖与根工程分开安装：

```powershell
npm --prefix desktop ci --no-audit --no-fund
node desktop/node_modules/electron/install.js
npm run build:new-design
npm run prepare:new-design
node scripts/package-desktop.mjs --no-zip
```

打包从最新 `dist-new-design/` 复制资源，默认输出到仓库同级的“桌面版发布”目录。每次建立新目录，不覆盖已有交付；不修改网页源码和原网页。所有运行资源打入 `resources/app.asar`，并记录模型及前端文件的 SHA256。

`--prepare-only` 只建立 `desktop/build/` 下的应用资源草稿。`--source=路径` 可指定另一套已构建资源；`--output-root=路径` 可指定交付目录。

## 验证与截图

先从 `desktop/build/latest-package.json` 取得 `executable`。使用独立测试参数启动：

```powershell
& '完整路径/氢能燃料电池发动机.exe' --desktop-test --remote-debugging-port=9333 '--desktop-test-dir=完整路径/测试记录'
```

测试模式默认隐藏窗口，避免抢焦点；加 `--desktop-show` 可显示。测试会输出 `desktop-diagnostics.json` 和 `desktop-overall.png`。报告包含本地资源请求、阻止的远端请求、浏览器错误、沙箱设置及模型是否加载完成。远程调试仅在测试参数启用时生效，并绑定 `127.0.0.1`。需要软件渲染时增加 `--desktop-software-rendering`；普通运行仍使用系统 GPU。

完成测试并关闭软件后生成交付 ZIP：

```powershell
node scripts/package-desktop.mjs '--zip-only=完整路径/交付目录'
```

也可运行 `node scripts/check-desktop.mjs` 自动检查最近一次打包的 EXE。它会以隐藏测试窗口启动，切换到浏览器离线模式后重新加载模型、核对 GLB 哈希、操作剖切控件并保存截图。测试输出在 `desktop/qa/`；无需改动普通启动行为。

运行库、依赖和大模型归档不提交 Git；忽略规则在 `desktop/.gitignore`。

## 版本与接口依据

固定 Electron 45.0.0；已核对[官方稳定版本列表](https://releases.electronjs.org/)、[自定义协议 API](https://www.electronjs.org/docs/latest/api/protocol)、[窗口 API](https://www.electronjs.org/docs/latest/api/browser-window)和[手工分发说明](https://www.electronjs.org/docs/latest/tutorial/application-distribution)。
