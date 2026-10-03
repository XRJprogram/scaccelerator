# Scaccelerator · 小码王 Scratch TurboWarp 加速播放器

输入小码王 Scratch 社区作品链接，直接以 TurboWarp 核心运行。支持 60 帧渲染、JS 原生编译加速、高清画笔渲染与克隆体上限突破。

---

## 核心功能

- **单屏一体化面板**：左侧为舞台展示中心，右侧整合作品载入与性能调优控制，全屏免滚动操作。
- **自定义舞台尺寸**：支持 480×360 (4:3 原版)、640×360 (16:9 宽屏)、480×480 (1:1) 及任意像素自定义尺寸。
- **闭源代码保护**：纯净播放器架构，不提供源码导出功能，保护原作者闭源劳动成果。
- **60 FPS / 120 FPS 高帧率运行**：突破原版 Scratch 30 帧限制，支持 60Hz 及高刷新率显示。
- **TurboWarp JS 编译加速**：采用 TurboWarp JIT 编译器，大幅提升复杂脚本与算法运算执行效率。
- **动作平滑插值 (Interpolation)**：在帧与帧之间计算补间，呈现平滑的角色动画。
- **高画质抗锯齿画笔 (HQ Pen)**：以高分辨率渲染 Pen 积木图形，消除锯齿与模糊。
- **解除克隆体与舞台限制**：解除 300 个克隆体上限，解除角色离开舞台边缘封顶限制。
- **小码王专用 AES 解密支持**：自动解析小码王通信协议，完成 AES-128-CBC 解密还原。
- **配套油猴脚本支持**：在小码王社区作品页直接提供跳转运行入口。

---

## 使用说明

### 1. Web 在线使用
访问 GitHub Pages 站点：
`https://xrjprogram.github.io/scaccelerator/`

1. 复制小码王社区任意作品地址（例如 `https://world.xiaomawang.com/community/main/compose/<作品ID>`）或作品 ID。
2. 粘贴至右侧输入框，点击 **“加载运行”**。
3. 亦可直接拖拽本地电脑中的 `.sb3` 文件至舞台区域加载。

### 2. URL 参数直接加载
通过 URL 参数可直接指定作品 ID：
```text
https://xrjprogram.github.io/scaccelerator/?id=<作品ID>
```

---

## 跨域与 Cloudflare Worker 代理配置教程 (必看)

由于国内小码王服务器（网宿 CDN）对外部跨域请求有较严格的防盗链与 IP 限制，公共海外代理容易报 403 错误。**强烈建议花 2 分钟配置专属 Cloudflare Worker 代理（完全免费，每天 10 万次请求）：**

### 步骤一：创建 Worker
1. 打开并登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 在左侧菜单点击 **Workers & Pages** -> **Overview** -> **Create Application**。
3. 点击 **Create Worker**，输入名称（例如 `sc-proxy`），点击右下角 **Deploy**。

### 步骤二：粘贴代理代码
1. 部署完成后，点击 **Edit Code** 进入代码编辑器。
2. 将本项目根目录下的 [`worker.js`](worker.js) 文件全部内容复制，替换编辑器里的全部代码。
3. 点击右上角 **Deploy** 部署。

### 步骤三：在 Scaccelerator 中填入 Worker 地址
1. 复制 Worker 页面提供的访问域名（例如 `https://sc-proxy.yourname.workers.dev`）。
2. 打开 Scaccelerator 网页，点击右上角设置图标。
3. 确保通道模式为 **Cloudflare Worker 代理**，并将地址填为：
   `https://sc-proxy.yourname.workers.dev/?url=`
4. 点击保存配置。后续所有小码王作品即可秒速跨域解密加载，彻底告别 403 节点不可用问题！

---

## 配套油猴脚本

为了在浏览小码王社区时快速调用，可使用仓库中提供的用户脚本 `scaccelerator.user.js`：

1. 浏览器安装 Tampermonkey 或 Violentmonkey 扩展。
2. 安装仓库中的 `scaccelerator.user.js` 文件。
3. 进入任意小码王作品详情页，操作栏中将出现 **【TurboWarp 播放器 (60FPS)】** 按钮，点击即可在新标签页以高帧率打开。

---

## 项目结构

```text
scaccelerator/
├── index.html              # 现代化单页结构 (单屏免滚动侧边栏布局)
├── style.css               # 样式定义 (暗色简洁风格)
├── app.js                  # 核心控制器 (小码王 API 联动、AES 解密、TurboWarp 生命周期管理)
├── lib/
│   ├── scaffolding-full.js # TurboWarp 官方 Scaffolding 运行时
│   └── crypto-js.min.js    # AES-128-CBC 解密库
├── worker.js               # Cloudflare Worker 跨域代理脚本
├── scaccelerator.user.js    # 小码王社区油猴脚本
└── README.md               # 项目技术说明
```

---

## 协议与说明

- 本项目基于 TurboWarp 核心引擎构建。
- Scratch 是麻省理工学院媒体实验室 Lifelong Kindergarten 团队的商标。
- 本工具仅供个人编程学习与作品性能测试交流使用。