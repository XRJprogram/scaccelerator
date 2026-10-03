# ⚡ Scaccelerator · 小码王 Scratch TurboWarp 极速加速器

> 输入小码王 Scratch 社区作品链接，即刻以 **TurboWarp** 核心运行！畅享 **60 帧超丝滑流畅、JS 原生编译加速、高清画笔渲染与克隆体上限突破**。

---

## ✨ 核心特性

- ⚡ **60 FPS / 120 FPS 高帧率运行**：打破原版 Scratch 30 帧瓶颈，支持 60Hz、120Hz 高刷新率，带来如丝般顺滑的游戏体验。
- 🚀 **TurboWarp JS 编译加速**：采用 TurboWarp 高性能 JIT 编译器，复杂脚本与算法运算提速数十倍，彻底告别卡顿。
- 🪄 **动作平滑插值 (Interpolation)**：在两帧之间智能计算补间，角色移动与转向极致顺畅。
- 🎨 **高清抗锯齿画笔 (HQ Pen)**：以视网膜分辨率渲染 Pen 积木图形，彻底消除原版画笔马赛克锯齿。
- ♾️ **解除克隆体与舞台限制**：突破原版 300 个克隆体上限，解除角色离开舞台边缘的坐标封顶。
- 🔑 **内置小码王 AES 解密算法**：自动识别小码王作品数据协议，原生完成 AES-128-CBC 解密还原。
- 💾 **一键导出 .sb3**：支持一键将小码王作品下载为标准 `.sb3` 文件保存到本地。
- 🌐 **多通道 CORS 代理容灾**：内置公共代理池自动故障转移，同时提供免费 1 键部署 Cloudflare Worker 私有节点方案。
- 🧩 **配套油猴脚本支持**：在小码王社区页面一键点击“⚡ TurboWarp 加速”无缝直达。

---

## 🚀 快速使用

### 1. Web 在线使用
访问 GitHub Pages 站点：
👉 `https://xrjprogram.github.io/scaccelerator/`

1. 复制小码王社区任意作品地址（例如 `https://world.xiaomawang.com/community/main/compose/8EKQ666J`）。
2. 粘贴到输入框，点击 **“加速运行”**。
3. 也支持直接拖拽本地 `.sb3` 文件到舞台秒速加载！

### 2. URL 参数快捷直达
可以通过 URL 参数直接加载指定作品：
```text
https://xrjprogram.github.io/scaccelerator/?id=8EKQ666J
```

---

## 🧩 配套小码王油猴脚本 (一键加速)

为了让你在逛小码王社区时体验更佳，仓库内附带了专属用户脚本 `scaccelerator.user.js`：

1. 浏览器安装 [Tampermonkey (油猴插件)](https://www.tampermonkey.net/)。
2. 安装仓库中的 [`scaccelerator.user.js`](scaccelerator.user.js)。
3. 打开任意小码王作品详情页，操作栏将自动出现 **【TurboWarp 加速运行 (60帧)】** 按钮，点击一键全屏高帧率启动！

---

## 🛡️ 跨域与私有 Cloudflare Worker 代理部署

由于 GitHub Pages 是纯前端静态托管，受浏览器同源策略 (CORS) 限制，请求国内小码王服务器需要通过代理。

虽然站点默认内置了智能公共代理池，但如果你想获得**最稳定、秒加载**的体验，推荐使用 Cloudflare Workers 部署专属代理节点（完全免费，每天 10 万次请求）：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Workers & Pages** -> **Create Application** -> **Create Worker**。
2. 将本项目根目录下的 [`worker.js`](worker.js) 内容全部复制并粘贴到 Worker 编辑器中，点击 **Deploy**。
3. 复制生成的 Worker 域名（例如 `https://my-sc-proxy.xxx.workers.dev`）。
4. 在 Scaccelerator 页面右上角点击 **设置 (⚙️)**，选择 **“自定义 Cloudflare Worker”** 并填入 `https://my-sc-proxy.xxx.workers.dev/?url=`，点击保存即可！

---

## 🛠️ 项目结构

```text
scaccelerator/
├── index.html              # 现代化单页应用 (响应式布局、状态控制、全屏支持)
├── style.css               # 极客暗黑风 UI 设计 (毛玻璃质感、霓虹动态点缀)
├── app.js                  # 核心控制器 (小码王 API 解析、AES 解密、TurboWarp 运行时控制)
├── lib/
│   ├── scaffolding-full.js # TurboWarp 官方 Scaffolding 运行时 (无外链依赖)
│   └── crypto-js.min.js    # AES-128-CBC 解密库
├── worker.js               # 专属 Cloudflare Worker 跨域代理脚本 (可选自建)
├── scaccelerator.user.js    # 小码王社区专属油猴脚本
└── README.md               # 项目文档与技术说明
```

---

## 📜 开源协议与鸣谢

- 本项目基于 [TurboWarp](https://turbowarp.org/) 核心引擎构建。
- Scratch 是麻省理工学院媒体实验室 Lifelong Kindergarten 团队的商标。
- 本工具仅供个人编程学习、作品性能测试与交流使用。