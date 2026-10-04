/**
 * Scaccelerator - 核心逻辑控制器
 * 负责小码王链接解析、CORS 代理请求、AES-128-CBC 解密、自定义舞台尺寸及 TurboWarp Scaffolding 运行
 */

(function () {
  'use strict';

  // 1. 小码王接口与固定加解密密钥 (AES-128-CBC)
  const AES_KEY = CryptoJS.enc.Utf8.parse("xmwcommunityskey");
  const AES_IV = CryptoJS.enc.Utf8.parse("0392139263920300");

  // 公共 CORS 代理池 (作为备选，小码王防盗链较严，建议优先自建 Worker)
  const PUBLIC_PROXIES = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  // 默认官方 Cloudflare Worker 高速代理节点
  const DEFAULT_WORKER_PROXY = 'https://scaccelerator.xrjprogram.workers.dev/?url=';

  // 全局内部状态 (闭包隔离，杜绝外部泄露与导出)
  const state = {
    scaffolding: null,
    stageWidth: 480,
    stageHeight: 360,
    settings: {
      fps: 60,
      interpolation: true,
      hqPen: true,
      infiniteClones: true,
      removeFencing: false,
      turbo: false,
      proxyMode: 'custom', // 默认使用高速 Cloudflare Worker 代理
      customProxyUrl: DEFAULT_WORKER_PROXY
    },
    isPaused: false
  };

  // DOM 元素引用
  const dom = {
    inputUrl: document.getElementById('input-url'),
    btnLoadUrl: document.getElementById('btn-load-url'),
    inputLocalFile: document.getElementById('input-local-file'),
    inputStageW: document.getElementById('input-stage-w'),
    inputStageH: document.getElementById('input-stage-h'),
    btnApplyCustomSize: document.getElementById('btn-apply-custom-size'),
    btnResetStageSize: document.getElementById('btn-reset-stage-size'),
    selectFps: document.getElementById('select-fps'),
    toggleInterpolation: document.getElementById('toggle-interpolation'),
    toggleHqpen: document.getElementById('toggle-hqpen'),
    toggleInfiniteClones: document.getElementById('toggle-infinite-clones'),
    toggleRemoveFencing: document.getElementById('toggle-remove-fencing'),
    toggleTurbo: document.getElementById('toggle-turbo'),
    stageSection: document.querySelector('.stage-section'),
    stageWrapper: document.getElementById('stage-wrapper'),
    stageToolbar: document.getElementById('stage-toolbar') || document.querySelector('.stage-toolbar'),
    stageContainer: document.getElementById('stage-container'),
    stagePlaceholder: document.getElementById('stage-placeholder'),
    stageOverlay: document.getElementById('stage-overlay'),
    overlayStatus: document.getElementById('overlay-status'),
    overlaySubstatus: document.getElementById('overlay-substatus'),
    btnGreenFlag: document.getElementById('btn-green-flag'),
    btnStopAll: document.getElementById('btn-stop-all'),
    btnPause: document.getElementById('btn-pause'),
    btnFullscreen: document.getElementById('btn-fullscreen'),
    fpsDisplay: document.getElementById('fps-display'),
    stageSizeDisplay: document.getElementById('stage-size-display'),
    metaCover: document.getElementById('meta-cover'),
    metaTitle: document.getElementById('meta-title'),
    metaAuthor: document.getElementById('meta-author'),
    statFps: document.getElementById('stat-fps'),
    statViews: document.getElementById('stat-views'),
    statLikes: document.getElementById('stat-likes'),
    toastContainer: document.getElementById('toast-container')
  };

  // Toast 消息提示
  function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // 加载遮罩更新
  function showOverlay(status, substatus = '') {
    dom.overlayStatus.textContent = status;
    dom.overlaySubstatus.textContent = substatus;
    dom.stageOverlay.classList.remove('hidden');
  }

  function hideOverlay() {
    dom.stageOverlay.classList.add('hidden');
  }

  // 本地配置持久化
  function loadLocalSettings() {
    try {
      const saved = localStorage.getItem('scaccelerator_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        // 兼容旧配置项
        if (parsed.removeLimits !== undefined && parsed.infiniteClones === undefined) {
          parsed.infiniteClones = true;
          parsed.removeFencing = false;
          delete parsed.removeLimits;
        }
        Object.assign(state.settings, parsed);
      }
      // 默认使用用户专属的 Cloudflare Worker 代理
      state.settings.proxyMode = 'custom';
      state.settings.customProxyUrl = DEFAULT_WORKER_PROXY;

      const savedSize = localStorage.getItem('scaccelerator_stage_size');
      if (savedSize) {
        const { w, h } = JSON.parse(savedSize);
        state.stageWidth = parseInt(w, 10) || 480;
        state.stageHeight = parseInt(h, 10) || 360;
      }
    } catch (e) {
      console.warn('读取本地配置失败:', e);
    }

    // 同步到 UI
    if (dom.selectFps) dom.selectFps.value = state.settings.fps.toString();
    if (dom.toggleInterpolation) dom.toggleInterpolation.checked = state.settings.interpolation;
    if (dom.toggleHqpen) dom.toggleHqpen.checked = state.settings.hqPen;
    if (dom.toggleInfiniteClones) dom.toggleInfiniteClones.checked = !!state.settings.infiniteClones;
    if (dom.toggleRemoveFencing) dom.toggleRemoveFencing.checked = !!state.settings.removeFencing;
    if (dom.toggleTurbo) dom.toggleTurbo.checked = state.settings.turbo;
    
    updateStageSizeUI();
  }

  function saveLocalSettings() {
    try {
      localStorage.setItem('scaccelerator_settings', JSON.stringify(state.settings));
      localStorage.setItem('scaccelerator_stage_size', JSON.stringify({
        w: state.stageWidth,
        h: state.stageHeight
      }));
    } catch (e) {
      console.warn('保存配置失败:', e);
    }
  }

  function updateProxyIndicator() {
    if (!dom.proxyIndicator) return;
    dom.proxyIndicator.textContent = '代理: 默认节点';
    dom.proxyIndicator.style.color = 'var(--accent-green)';
  }

  // 动态自适应计算：按舞台比例以最大尺寸填充左侧舞台区域
  function resizeStageBox() {
    if (!dom.stageSection || !dom.stageWrapper || !dom.stageContainer) return;

    if (document.fullscreenElement) {
      dom.stageWrapper.style.width = '100vw';
      dom.stageWrapper.style.height = '100vh';
      dom.stageContainer.style.width = '100vw';
      dom.stageContainer.style.height = 'calc(100vh - 36px)';
      if (state.scaffolding && typeof state.scaffolding.relayout === 'function') {
        state.scaffolding.relayout();
      }
      return;
    }

    const sectionRect = dom.stageSection.getBoundingClientRect();
    // 留出边距 (8px padding * 2 = 16px)
    const availW = Math.max(120, Math.floor(sectionRect.width - 16));
    const availH = Math.max(120, Math.floor(sectionRect.height - 16));
    const toolbarH = dom.stageToolbar ? dom.stageToolbar.offsetHeight : 36;

    const ratio = (state.stageWidth > 0 && state.stageHeight > 0)
      ? (state.stageWidth / state.stageHeight)
      : (4 / 3);

    // 最大可用于显示 stage 的高度
    const maxStageH = Math.max(50, availH - toolbarH);

    // 先以宽度为基准计算高度
    let targetW = availW;
    let targetH = Math.round(targetW / ratio);

    // 在单屏桌面视口下 (宽度 > 860px)，受 section 高度约束，确保舞台完全嵌在可视区域内无需滚动
    const isDesktop = window.innerWidth > 860;
    if (isDesktop && targetH > maxStageH) {
      targetH = maxStageH;
      targetW = Math.round(targetH * ratio);
    }

    dom.stageWrapper.style.width = `${targetW}px`;
    dom.stageWrapper.style.height = `${targetH + toolbarH}px`;
    dom.stageContainer.style.width = `${targetW}px`;
    dom.stageContainer.style.height = `${targetH}px`;

    // 通知 Scaffolding 运行时重新排版并调整 WebGL 画布像素
    if (state.scaffolding && typeof state.scaffolding.relayout === 'function') {
      state.scaffolding.relayout();
    }
  }

  // 舞台分辨率更新
  function setStageDimensions(width, height) {
    state.stageWidth = parseInt(width, 10) || 480;
    state.stageHeight = parseInt(height, 10) || 360;

    updateStageSizeUI();

    // 如果播放器已存在，动态更新尺寸与重排
    if (state.scaffolding) {
      state.scaffolding.width = state.stageWidth;
      state.scaffolding.height = state.stageHeight;
      if (state.scaffolding.vm && typeof state.scaffolding.vm.setStageSize === 'function') {
        state.scaffolding.vm.setStageSize(state.stageWidth, state.stageHeight);
      }
    }

    resizeStageBox();
    saveLocalSettings();
  }

  function updateStageSizeUI() {
    if (dom.stageSizeDisplay) {
      dom.stageSizeDisplay.textContent = `${state.stageWidth} × ${state.stageHeight}`;
    }
    if (dom.inputStageW && parseInt(dom.inputStageW.value, 10) !== state.stageWidth) {
      dom.inputStageW.value = state.stageWidth;
    }
    if (dom.inputStageH && parseInt(dom.inputStageH.value, 10) !== state.stageHeight) {
      dom.inputStageH.value = state.stageHeight;
    }
  }

  // 解析输入，获取作品 ID 或直链
  function parseInput(input) {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // 匹配常规小码王作品 URL
    const match = trimmed.match(/\/compose\/([a-zA-Z0-9_-]+)/);
    if (match) return { type: 'id', value: match[1] };

    // 匹配创作页 URL
    const matchCreate = trimmed.match(/\/create\/([a-zA-Z0-9_-]+)/);
    if (matchCreate) return { type: 'id', value: matchCreate[1] };

    // 匹配直链 .sb3 / .sb2
    if (trimmed.endsWith('.sb3') || trimmed.endsWith('.sb2')) {
      return { type: 'direct_url', value: trimmed };
    }

    // 纯 ID (通常为 6-12 位英文与数字)
    if (/^[a-zA-Z0-9_-]{4,20}$/.test(trimmed)) {
      return { type: 'id', value: trimmed };
    }

    return null;
  }

  // 规范化小码王 URL，消除双斜杠并对 .sb3 扩展名进行百分号编码以绕过网宿 CDN 403 规则
  function normalizeXiaoMaWangUrl(url) {
    if (typeof url !== 'string') return url;
    let cleaned = url.replace(/([^:])\/\/+/g, '$1/');
    cleaned = cleaned.replace(/\.sb3(?=$|[?#])/i, '%2Esb3').replace(/\.sb2(?=$|[?#])/i, '%2Esb2');
    return cleaned;
  }

  // 将目标 URL 转换为经由专属代理节点的完整 URL (附带 Referer 穿透防盗链)
  function toProxyUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    const normalized = normalizeXiaoMaWangUrl(rawUrl);
    if (state.settings.proxyMode === 'direct') return normalized;

    const customPrefix = (state.settings.customProxyUrl || DEFAULT_WORKER_PROXY).trim();
    if (customPrefix.includes('?url=')) return `${customPrefix}${encodeURIComponent(normalized)}`;
    if (customPrefix.includes('?')) return `${customPrefix}&url=${encodeURIComponent(normalized)}`;
    const cleanBase = customPrefix.replace(/\/+$/, '');
    return `${cleanBase}/?url=${encodeURIComponent(normalized)}`;
  }

  // 跨域通用 Fetch (带代理轮询及重试机制)
  async function fetchWithProxy(targetUrl, isBinary = false) {
    const mode = state.settings.proxyMode;
    const normalizedUrl = normalizeXiaoMaWangUrl(targetUrl);

    // 1. 直连模式 (无代理)
    if (mode === 'direct') {
      const res = await fetch(normalizedUrl);
      if (!res.ok) throw new Error(`直连请求失败: HTTP ${res.status}`);
      return isBinary ? await res.arrayBuffer() : await res.text();
    }

    // 2. Cloudflare Worker 代理模式 (默认推荐)
    if (mode === 'custom') {
      const proxyUrl = toProxyUrl(normalizedUrl);
      const res = await fetch(proxyUrl);
      if (res.ok) {
        return isBinary ? await res.arrayBuffer() : await res.text();
      }
      throw new Error(`专属代理节点返回 HTTP ${res.status} (${res.statusText || '请求异常'})`);
    }

    // 3. 公共代理池轮询模式 (仅在未配置专属节点时使用)
    let lastError = null;
    for (let i = 0; i < PUBLIC_PROXIES.length; i++) {
      const proxyFn = PUBLIC_PROXIES[i];
      const proxyUrl = proxyFn(normalizedUrl);
      try {
        const res = await fetch(proxyUrl);
        if (res.ok) {
          return isBinary ? await res.arrayBuffer() : await res.text();
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(lastError ? `公共代理节点不可用: ${lastError.message}` : '请求失败');
  }

  // 小码王 AES 加密数据解密器
  function decryptXiaoMaWangData(ciphertextHex) {
    try {
      const hex = CryptoJS.enc.Hex.parse(ciphertextHex);
      const base64Str = CryptoJS.enc.Base64.stringify(hex);
      const decrypted = CryptoJS.AES.decrypt(base64Str, AES_KEY, {
        iv: AES_IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (err) {
      console.error('[Scaccelerator] AES 解密失败:', err);
      throw new Error('解密小码王作品数据失败，可能密钥或格式有变');
    }
  }

  // 将 UTF-8 字符串转为 Uint8Array
  function stringToUint8Array(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code < 128) {
        bytes.push(code);
      } else if (code < 2048) {
        bytes.push(192 | (code >> 6), 128 | (63 & code));
      } else if (code < 55296 || code >= 57344) {
        bytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (63 & code));
      } else {
        i++;
        code = 65536 + (((1023 & code) << 10) | (1023 & str.charCodeAt(i)));
        bytes.push(
          240 | (code >> 18),
          128 | ((code >> 12) & 63),
          128 | ((code >> 6) & 63),
          128 | (63 & code)
        );
      }
    }
    return new Uint8Array(bytes);
  }

  // 获取作品详情元数据
  async function fetchProjectMeta(compositionId) {
    try {
      const detailUrl = `https://world.xiaomawang.com/community/main/compose/${compositionId}`;
      const html = await fetchWithProxy(detailUrl, false);
      const match = html.match(/id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/);
      if (match) {
        const nextData = JSON.parse(match[1]);
        const composeInfo = nextData?.props?.initialState?.detail?.composeInfo;
        if (composeInfo) {
          const rawCover = composeInfo.coverKey || composeInfo.cover || '';
          return {
            title: composeInfo.title || '未知作品',
            author: composeInfo.userObject?.nickname || '未知创作者',
            cover: rawCover ? toProxyUrl(rawCover) : '',
            views: composeInfo.statObject?.viewCount ?? '-',
            likes: composeInfo.statObject?.likeCount ?? '-',
            fileKey: composeInfo.fileKey || ''
          };
        }
      }
    } catch (e) {
      console.warn('获取作品元数据失败:', e);
    }
    return null;
  }

  // 注册小码王专属扩展与动态未知扩展兼容适配器
  function registerXiaoMaWangExtensions(vm) {
    if (!vm || !vm.extensionManager) return;
    const em = vm.extensionManager;

    // 1. 小码王核心增强扩展 (enhance)
    class XiaoMaWangEnhance {
      constructor(runtime) {
        this.runtime = runtime;
      }
      getInfo() {
        return {
          id: 'enhance',
          name: '项目增强',
          color1: '#a24435',
          blocks: [
            {
              opcode: 'setFramerate',
              blockType: 'command',
              text: '以每秒[FRAMERATE]帧运行',
              arguments: {
                FRAMERATE: { type: 'number', defaultValue: 30 }
              }
            },
            {
              opcode: 'infiniteClones',
              blockType: 'command',
              text: '克隆体上限[MAXCLONES]',
              arguments: {
                MAXCLONES: { type: 'number', defaultValue: 300 }
              }
            },
            {
              opcode: 'removeFence',
              blockType: 'command',
              text: '[ENABLEFENCE]角色围栏',
              arguments: {
                ENABLEFENCE: { type: 'number', menu: 'ENABLE_TYPE', defaultValue: 1 }
              }
            }
          ],
          menus: {
            ENABLE_TYPE: [
              { text: '启用', value: 1 },
              { text: '禁用', value: 0 }
            ]
          }
        };
      }
      setFramerate(args) {
        // 如果用户在播放器控制面板设定了更高帧率(如 60/120/无限制)，优先保证用户的高性能加速体验
        const userFps = state.settings.fps;
        const requestedFps = +args.FRAMERATE || 30;
        if (userFps > 30 || userFps === 0) {
          console.log(`[Scaccelerator] 忽略作品内建限速积木 (${requestedFps} FPS)，保持用户设定的 TurboWarp 高性能帧率: ${userFps === 0 ? 'MAX' : userFps}`);
          return;
        }
        if (this.runtime && typeof this.runtime.setFramerate === 'function') {
          this.runtime.setFramerate(requestedFps);
        }
      }
      infiniteClones(args) {
        if (this.runtime && typeof this.runtime.setRuntimeOptions === 'function') {
          const max = +args.MAXCLONES;
          this.runtime.setRuntimeOptions({ maxClones: max > 0 ? max : Infinity });
        }
      }
      removeFence(args) {
        if (this.runtime && typeof this.runtime.setRuntimeOptions === 'function') {
          // 1: 启用围栏(受限), 0: 禁用围栏(解除限制)
          this.runtime.setRuntimeOptions({ fencing: !+args.ENABLEFENCE });
        }
      }
    }

    // 2. 小码王专属扩展 (xiaoma)
    class XiaoMaWangGeneral {
      constructor(runtime) {
        this.runtime = runtime;
      }
      getInfo() {
        return {
          id: 'xiaoma',
          name: '小码王积木',
          blocks: [
            {
              opcode: 'getXiaomaUserInfo',
              blockType: 'reporter',
              text: '小码王 [USER_TYPE]',
              arguments: {
                USER_TYPE: { type: 'number', defaultValue: 1 }
              }
            },
            {
              opcode: 'xiaomaPurchase',
              blockType: 'command',
              text: '花费 [MONEY] 金币购买 [COMMODITY]',
              arguments: {
                MONEY: { type: 'number', defaultValue: 1 },
                COMMODITY: { type: 'string', defaultValue: '道具' }
              }
            }
          ],
          menus: {
            USER_TYPE: [
              { text: '用户ID', value: 1 },
              { text: '用户名', value: 2 }
            ]
          }
        };
      }
      getXiaomaUserInfo(args) {
        return args.USER_TYPE === 2 ? '小码王创作者' : '888888';
      }
      xiaomaPurchase(args) {
        console.log('[Scaccelerator] 模拟内购积木执行:', args);
      }
    }

    em.addBuiltinExtension('enhance', XiaoMaWangEnhance);
    em.addBuiltinExtension('xiaoma', XiaoMaWangGeneral);

    // 3. 通用自动注册拦截器：当项目请求任何未内置的第三方/自定义扩展时，动态构造安全兼容扩展，杜绝 Unknown extension 报错
    const originalIsBuiltin = em.isBuiltinExtension.bind(em);
    em.isBuiltinExtension = function(extId) {
      if (originalIsBuiltin(extId)) return true;
      console.warn(`[Scaccelerator] 动态注入未知扩展兼容层: ${extId}`);
      class DynamicFallbackExtension {
        constructor(runtime) {
          this.runtime = runtime;
        }
        getInfo() {
          return {
            id: extId,
            name: extId,
            blocks: []
          };
        }
      }
      em.addBuiltinExtension(extId, DynamicFallbackExtension);
      return true;
    };
  }

  // 核心：加载并启动项目 (严格闭包隔离，不向外界暴露原始代码)
  async function loadAndRunProject(projectData, meta = {}) {
    showOverlay('正在初始化 TurboWarp 虚拟机...', '启动 JS 编译加速引擎');

    // 1. 清理已有实例
    if (state.scaffolding) {
      try {
        state.scaffolding.stopAll();
      } catch (e) {}
      state.scaffolding = null;
    }
    // 移除容器中原有的 Scaffolding 节点，避免覆盖 placeholder 与 overlay
    const oldRoots = dom.stageContainer.querySelectorAll('.sc-root');
    oldRoots.forEach(el => el.remove());

    // 2. 隐藏初始占位，创建新 Scaffolding
    if (dom.stagePlaceholder) {
      dom.stagePlaceholder.style.display = 'none';
    }

    // 确保容器尺寸与当前舞台比例匹配并以最大尺寸填充
    resizeStageBox();

    const scaffolding = new Scaffolding.Scaffolding();
    state.scaffolding = scaffolding;

    scaffolding.width = state.stageWidth;
    scaffolding.height = state.stageHeight;
    scaffolding.resizeMode = 'preserve-ratio';
    scaffolding.editableLists = false;

    // 3. 挂载到容器
    scaffolding.setup();
    scaffolding.appendTo(dom.stageContainer);

    // 挂载后再重排一次，确保 WebGL 画布和图层完全同步最新像素
    resizeStageBox();

    // 4. 注册小码王专属扩展与未知扩展安全兼容兜底
    registerXiaoMaWangExtensions(scaffolding.vm);

    // 5. 配置素材加载源 (经由代理附加官方 Referer，穿透网宿 CDN 防盗链 403)
    const storage = scaffolding.storage;

    storage.addWebStore(
      [storage.AssetType.ImageVector, storage.AssetType.ImageBitmap],
      (asset) => {
        const ext = asset.dataFormat || (asset.assetType.name === 'ImageVector' ? 'svg' : 'png');
        return toProxyUrl(`https://community-wscdn.xiaomawang.com/picture/${asset.assetId}.${ext}`);
      }
    );
    storage.addWebStore(
      [storage.AssetType.Sound],
      (asset) => {
        const ext = asset.dataFormat || 'mp3';
        return toProxyUrl(`https://community-wscdn.xiaomawang.com/audio/${asset.assetId}.${ext}`);
      }
    );
    // 官方素材库作为备用回退源
    storage.addWebStore(
      [storage.AssetType.ImageVector, storage.AssetType.ImageBitmap],
      (asset) => `https://assets.scratch.mit.edu/internalapi/asset/${asset.assetId}.${asset.dataFormat}/get/`
    );
    storage.addWebStore(
      [storage.AssetType.Sound],
      (asset) => `https://assets.scratch.mit.edu/internalapi/asset/${asset.assetId}.${asset.dataFormat}/get/`
    );

    // 6. 安装实时 WebGL 帧率采样跟踪器
    setupLiveFpsTracker(scaffolding);

    showOverlay('正在载入项目资源...', '解析角色、声音与造型素材');

    // 7. 载入项目二进制数据
    await scaffolding.loadProject(projectData);

    // 8. 全量激活 TurboWarp JS 编译加速引擎与各项性能参数 (在 loadProject 后全量生效)
    applyTurboWarpOptions(scaffolding);

    // 监听编译状态与回退异常
    if (scaffolding.vm && scaffolding.vm.runtime) {
      scaffolding.vm.runtime.on('COMPILE_ERROR', (target, err) => {
        console.warn(`[TurboWarp Compiler] 角色 [${target?.getName ? target.getName() : '未知'}] 编译回退:`, err);
      });
    }

    // 9. 更新右侧元数据信息
    updateProjectMetaUI(meta);

    hideOverlay();
    showToast('项目已成功加载并启动 (TurboWarp 编译加速已就绪)');

    // 10. 启动绿旗
    scaffolding.start();
    state.isPaused = false;
  }

  // 实时 FPS 监控器：在 WebGL 实际绘制调用上统计实时帧率
  function setupLiveFpsTracker(scaffolding) {
    if (!scaffolding || !scaffolding.renderer || scaffolding._fpsTrackerInstalled) return;
    scaffolding._fpsTrackerInstalled = true;

    let frames = 0;
    let lastTime = performance.now();

    const originalDraw = scaffolding.renderer.draw.bind(scaffolding.renderer);
    scaffolding.renderer.draw = function() {
      frames++;
      const now = performance.now();
      const delta = now - lastTime;
      if (delta >= 600) {
        const liveFps = Math.round((frames * 1000) / delta);
        if (dom.statFps) dom.statFps.textContent = `${liveFps} FPS`;
        if (dom.fpsDisplay) dom.fpsDisplay.textContent = `${liveFps} FPS`;
        frames = 0;
        lastTime = now;
      }
      return originalDraw.apply(this, arguments);
    };
  }

  // 应用实时选项到虚拟机
  function applyTurboWarpOptions(scaffolding = state.scaffolding) {
    if (!scaffolding || !scaffolding.vm) return;

    const fps = state.settings.fps;
    scaffolding.vm.setFramerate(fps);
    scaffolding.vm.setInterpolation(state.settings.interpolation);
    if (scaffolding.renderer && typeof scaffolding.renderer.setUseHighQualityRender === 'function') {
      scaffolding.renderer.setUseHighQualityRender(state.settings.hqPen);
    }
    scaffolding.vm.setTurboMode(state.settings.turbo);
    scaffolding.vm.setRuntimeOptions({
      fencing: !state.settings.removeFencing,
      miscLimits: false,
      maxClones: state.settings.infiniteClones ? Infinity : 300
    });

    // 显式激活 TurboWarp JS JIT 编译器
    if (typeof scaffolding.vm.setCompilerOptions === 'function') {
      scaffolding.vm.setCompilerOptions({
        enabled: true,
        warpTimer: false
      });
    }

    dom.statFps.textContent = fps === 0 ? '无限制' : `${fps} FPS`;
    dom.fpsDisplay.textContent = fps === 0 ? 'MAX' : `${fps} FPS`;
  }

  // 更新元数据 UI
  function updateProjectMetaUI(meta) {
    if (!meta) return;
    if (meta.title) dom.metaTitle.textContent = meta.title;
    if (meta.author) dom.metaAuthor.textContent = meta.author;
    if (meta.cover && dom.metaCover) {
      const coverUrl = (meta.cover.startsWith('http') && !meta.cover.includes('workers.dev'))
        ? toProxyUrl(meta.cover)
        : meta.cover;
      dom.metaCover.src = coverUrl;
    }
    if (meta.views !== undefined) dom.statViews.textContent = meta.views;
    if (meta.likes !== undefined) dom.statLikes.textContent = meta.likes;
  }

  // 通过作品 ID 请求并加载
  async function loadProjectById(id) {
    showOverlay('正在从小码王获取作品数据...', `作品 ID: ${id}`);
    dom.btnLoadUrl.disabled = true;

    try {
      // 1. 请求作品包
      const apiUrl = `https://community-api.xiaomawang.com/japi/v1/composition/get-encrypt-sb3?compositionEncryptId=${id}`;
      
      const [apiResponseText, meta] = await Promise.all([
        fetchWithProxy(apiUrl, false),
        fetchProjectMeta(id)
      ]);

      if (meta) {
        updateProjectMetaUI(meta);
      }

      const resJson = JSON.parse(apiResponseText);
      if (resJson.code !== 0 && resJson.code !== 200) {
        throw new Error(resJson.message || `接口错误码: ${resJson.code}`);
      }

      let dataPayload = resJson.data;
      if (!dataPayload) {
        throw new Error('小码王接口未返回作品数据或作品已被删除/私密');
      }

      let sb3ArrayBuffer = null;

      // 判断是明文直链还是加密串
      if (typeof dataPayload === 'string' && (dataPayload.startsWith('http://') || dataPayload.startsWith('https://'))) {
        showOverlay('正在下载作品文件...', '拉取云端 .sb3 包');
        sb3ArrayBuffer = await fetchWithProxy(dataPayload, true);
      } else {
        // AES 解密流程
        showOverlay('正在解密加密作品包...', 'AES-128-CBC 校验');
        const decryptedStr = decryptXiaoMaWangData(dataPayload);
        if (decryptedStr.startsWith('http://') || decryptedStr.startsWith('https://')) {
          showOverlay('正在下载解密直链...', '拉取云端 .sb3 包');
          sb3ArrayBuffer = await fetchWithProxy(decryptedStr, true);
        } else {
          // 直接是解密出的二进制流
          sb3ArrayBuffer = stringToUint8Array(decryptedStr).buffer;
        }
      }

      await loadAndRunProject(sb3ArrayBuffer, meta || { title: `小码王作品 ${id}` });
    } catch (err) {
      console.error(err);
      hideOverlay();
      showToast(`加载失败: ${err.message}`, 5000);
    } finally {
      dom.btnLoadUrl.disabled = false;
    }
  }

  // 绑定交互事件
  function bindEvents() {
    // 1. 加载按钮点击
    dom.btnLoadUrl.addEventListener('click', () => {
      const parsed = parseInput(dom.inputUrl.value);
      if (!parsed) {
        showToast('请输入有效的小码王作品网址或 ID');
        dom.inputUrl.focus();
        return;
      }

      if (parsed.type === 'id') {
        loadProjectById(parsed.value);
      } else if (parsed.type === 'direct_url') {
        showOverlay('正在下载作品...', parsed.value);
        fetchWithProxy(parsed.value, true)
          .then((buf) => loadAndRunProject(buf, { title: '外部 Scratch 作品' }))
          .catch((err) => {
            hideOverlay();
            showToast(`下载失败: ${err.message}`);
          });
      }
    });

    // 回车快捷触发
    dom.inputUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        dom.btnLoadUrl.click();
      }
    });

    // 2. 本地文件上传支持
    dom.inputLocalFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          await loadAndRunProject(reader.result, {
            title: file.name.replace(/\.[^/.]+$/, ''),
            author: '本地文件'
          });
        } catch (err) {
          hideOverlay();
          showToast(`解析本地文件失败: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    });

    // 3. 拖拽文件到舞台
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.sb3') || file.name.endsWith('.sb2'))) {
        const reader = new FileReader();
        reader.onload = async () => {
          await loadAndRunProject(reader.result, {
            title: file.name.replace(/\.[^/.]+$/, ''),
            author: '拖拽上传'
          });
        };
        reader.readAsArrayBuffer(file);
      }
    });

    // 4. 舞台尺寸输入与应用 (单行自定义)
    const applySizeInputs = () => {
      const w = parseInt(dom.inputStageW.value, 10);
      const h = parseInt(dom.inputStageH.value, 10);
      if (w >= 100 && h >= 100) {
        setStageDimensions(w, h);
        showToast(`舞台尺寸已调整: ${w} × ${h}`);
      } else {
        showToast('舞台宽高必须大于等于 100');
      }
    };

    if (dom.btnApplyCustomSize) {
      dom.btnApplyCustomSize.addEventListener('click', applySizeInputs);
    }
    if (dom.btnResetStageSize) {
      dom.btnResetStageSize.addEventListener('click', () => {
        setStageDimensions(480, 360);
        showToast('已恢复原生 480 × 360 舞台尺寸');
      });
    }
    if (dom.inputStageW) {
      dom.inputStageW.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applySizeInputs();
      });
      dom.inputStageW.addEventListener('change', applySizeInputs);
    }
    if (dom.inputStageH) {
      dom.inputStageH.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applySizeInputs();
      });
      dom.inputStageH.addEventListener('change', applySizeInputs);
    }

    // 5. 播放控制条事件
    dom.btnGreenFlag.addEventListener('click', () => {
      if (state.scaffolding) {
        state.scaffolding.greenFlag();
        state.isPaused = false;
        showToast('已启动');
      }
    });

    dom.btnStopAll.addEventListener('click', () => {
      if (state.scaffolding) {
        state.scaffolding.stopAll();
        state.isPaused = false;
        showToast('已停止全部');
      }
    });

    dom.btnPause.addEventListener('click', () => {
      if (!state.scaffolding || !state.scaffolding.vm) return;
      state.isPaused = !state.isPaused;
      if (typeof state.scaffolding.vm.setPaused === 'function') {
        state.scaffolding.vm.setPaused(state.isPaused);
      } else {
        if (state.isPaused) state.scaffolding.vm.stop();
        else state.scaffolding.vm.start();
      }
      showToast(state.isPaused ? '已暂停' : '继续运行');
    });

    dom.btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        dom.stageWrapper.requestFullscreen().catch((err) => {
          showToast(`全屏失败: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    });

    // 6. 性能选项调整事件
    dom.selectFps.addEventListener('change', () => {
      state.settings.fps = parseInt(dom.selectFps.value, 10);
      saveLocalSettings();
      applyTurboWarpOptions();
      showToast(`目标帧率已设置为: ${dom.selectFps.options[dom.selectFps.selectedIndex].text}`);
    });

    dom.toggleInterpolation.addEventListener('change', () => {
      state.settings.interpolation = dom.toggleInterpolation.checked;
      saveLocalSettings();
      applyTurboWarpOptions();
    });

    dom.toggleHqpen.addEventListener('change', () => {
      state.settings.hqPen = dom.toggleHqpen.checked;
      saveLocalSettings();
      applyTurboWarpOptions();
    });

    if (dom.toggleInfiniteClones) {
      dom.toggleInfiniteClones.addEventListener('change', () => {
        state.settings.infiniteClones = dom.toggleInfiniteClones.checked;
        saveLocalSettings();
        applyTurboWarpOptions();
        showToast(state.settings.infiniteClones ? '已解除 300 克隆体上限' : '已限制为 300 克隆体');
      });
    }

    if (dom.toggleRemoveFencing) {
      dom.toggleRemoveFencing.addEventListener('change', () => {
        state.settings.removeFencing = dom.toggleRemoveFencing.checked;
        saveLocalSettings();
        applyTurboWarpOptions();
        if (state.settings.removeFencing) {
          showToast('已解除边缘限制 (部分作品克隆体可能跑出舞台)');
        } else {
          showToast('已恢复原生舞台边缘围栏保护');
        }
      });
    }

    dom.toggleTurbo.addEventListener('change', () => {
      state.settings.turbo = dom.toggleTurbo.checked;
      saveLocalSettings();
      applyTurboWarpOptions();
      showToast(state.settings.turbo ? '加速模式已开启' : '加速模式已关闭');
    });

    // 封面加载失败兜底
    if (dom.metaCover) {
      dom.metaCover.addEventListener('error', () => {
        dom.metaCover.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='48' viewBox='0 0 64 48'%3E%3Crect width='64' height='48' fill='%23161b22'/%3E%3C/svg%3E";
      });
    }

    // 7. 视口自适应与全屏监听
    window.addEventListener('resize', resizeStageBox);
    document.addEventListener('fullscreenchange', () => {
      setTimeout(resizeStageBox, 60);
    });

    if (window.ResizeObserver && dom.stageSection) {
      const resizeObserver = new ResizeObserver(() => {
        resizeStageBox();
      });
      resizeObserver.observe(dom.stageSection);
    }
  }

  // 页面加载自动检测 URL 查询参数 (?id=<id>&proxy=...)
  function checkUrlQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const url = params.get('url');
    const proxy = params.get('proxy');

    if (proxy) {
      state.settings.proxyMode = 'custom';
      state.settings.customProxyUrl = proxy;
      saveLocalSettings();
      updateProxyIndicator();
    }

    if (id) {
      dom.inputUrl.value = id;
      loadProjectById(id);
    } else if (url) {
      dom.inputUrl.value = url;
      dom.btnLoadUrl.click();
    }
  }

  // 初始化入口
  function init() {
    loadLocalSettings();
    bindEvents();
    resizeStageBox();
    checkUrlQueryParams();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
