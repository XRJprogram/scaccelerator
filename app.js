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

  // 全局内部状态 (闭包隔离，杜绝外部泄露与导出)
  const state = {
    scaffolding: null,
    stageWidth: 480,
    stageHeight: 360,
    settings: {
      fps: 60,
      interpolation: true,
      hqPen: true,
      removeLimits: true,
      turbo: false,
      proxyMode: 'custom', // 优先推荐自定义 worker
      customProxyUrl: ''
    },
    isPaused: false
  };

  // DOM 元素引用
  const dom = {
    inputUrl: document.getElementById('input-url'),
    btnLoadUrl: document.getElementById('btn-load-url'),
    inputLocalFile: document.getElementById('input-local-file'),
    selectStageSize: document.getElementById('select-stage-size'),
    customSizeInputs: document.getElementById('custom-size-inputs'),
    inputStageW: document.getElementById('input-stage-w'),
    inputStageH: document.getElementById('input-stage-h'),
    btnApplyCustomSize: document.getElementById('btn-apply-custom-size'),
    selectFps: document.getElementById('select-fps'),
    toggleInterpolation: document.getElementById('toggle-interpolation'),
    toggleHqpen: document.getElementById('toggle-hqpen'),
    toggleRemoveLimits: document.getElementById('toggle-removelimits'),
    toggleTurbo: document.getElementById('toggle-turbo'),
    stageWrapper: document.getElementById('stage-wrapper'),
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
    proxyIndicator: document.getElementById('proxy-indicator'),
    metaCover: document.getElementById('meta-cover'),
    metaTitle: document.getElementById('meta-title'),
    metaAuthor: document.getElementById('meta-author'),
    statFps: document.getElementById('stat-fps'),
    statViews: document.getElementById('stat-views'),
    statLikes: document.getElementById('stat-likes'),
    modalSettings: document.getElementById('modal-settings'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    btnCancelSettings: document.getElementById('btn-cancel-settings'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    selectProxyMode: document.getElementById('select-proxy-mode'),
    customProxyRow: document.getElementById('custom-proxy-row'),
    inputCustomProxy: document.getElementById('input-custom-proxy'),
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
        Object.assign(state.settings, JSON.parse(saved));
      }
      const savedSize = localStorage.getItem('scaccelerator_stage_size');
      if (savedSize) {
        const { w, h, mode } = JSON.parse(savedSize);
        state.stageWidth = w || 480;
        state.stageHeight = h || 360;
        dom.selectStageSize.value = mode || '480x360';
        if (mode === 'custom') {
          dom.customSizeInputs.style.display = 'flex';
          dom.inputStageW.value = state.stageWidth;
          dom.inputStageH.value = state.stageHeight;
        }
      }
    } catch (e) {
      console.warn('读取本地配置失败:', e);
    }

    // 同步到 UI
    dom.selectFps.value = state.settings.fps.toString();
    dom.toggleInterpolation.checked = state.settings.interpolation;
    dom.toggleHqpen.checked = state.settings.hqPen;
    dom.toggleRemoveLimits.checked = state.settings.removeLimits;
    dom.toggleTurbo.checked = state.settings.turbo;
    dom.selectProxyMode.value = state.settings.proxyMode;
    dom.inputCustomProxy.value = state.settings.customProxyUrl;
    dom.customProxyRow.style.display = state.settings.proxyMode === 'custom' ? 'flex' : 'none';
    
    updateProxyIndicator();
    updateStageSizeUI();
  }

  function saveLocalSettings() {
    try {
      localStorage.setItem('scaccelerator_settings', JSON.stringify(state.settings));
      localStorage.setItem('scaccelerator_stage_size', JSON.stringify({
        w: state.stageWidth,
        h: state.stageHeight,
        mode: dom.selectStageSize.value
      }));
    } catch (e) {
      console.warn('保存配置失败:', e);
    }
  }

  function updateProxyIndicator() {
    if (state.settings.proxyMode === 'custom') {
      dom.proxyIndicator.textContent = state.settings.customProxyUrl ? '代理: Cloudflare Worker' : '代理: 未填 Worker 地址';
      dom.proxyIndicator.style.color = state.settings.customProxyUrl ? 'var(--accent-green)' : 'var(--accent-red)';
    } else if (state.settings.proxyMode === 'auto') {
      dom.proxyIndicator.textContent = '代理: 公共代理池';
      dom.proxyIndicator.style.color = 'var(--text-secondary)';
    } else {
      dom.proxyIndicator.textContent = '代理: 直连模式';
      dom.proxyIndicator.style.color = 'var(--text-muted)';
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
      if (typeof state.scaffolding.relayout === 'function') {
        state.scaffolding.relayout();
      }
    }

    saveLocalSettings();
  }

  function updateStageSizeUI() {
    dom.stageSizeDisplay.textContent = `${state.stageWidth} × ${state.stageHeight}`;
    dom.stageWrapper.style.aspectRatio = `${state.stageWidth} / ${state.stageHeight}`;
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

  // 跨域通用 Fetch (带代理轮询及重试机制)
  async function fetchWithProxy(targetUrl, isBinary = false) {
    const mode = state.settings.proxyMode;

    // 1. 直连模式 (无代理)
    if (mode === 'direct') {
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error(`直连请求失败: HTTP ${res.status}`);
      return isBinary ? await res.arrayBuffer() : await res.text();
    }

    // 2. 自定义 Cloudflare Worker 模式 (首选推荐)
    if (mode === 'custom') {
      let customPrefix = state.settings.customProxyUrl.trim();
      if (!customPrefix) {
        throw new Error('未配置 Cloudflare Worker 代理地址，请点击右上角设置图标填写');
      }
      const proxyUrl = customPrefix.includes('?') 
        ? `${customPrefix}${encodeURIComponent(targetUrl)}` 
        : `${customPrefix}?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`Worker 代理请求失败: HTTP ${res.status}`);
      return isBinary ? await res.arrayBuffer() : await res.text();
    }

    // 3. 公共代理池轮询模式
    let lastError = null;
    for (let i = 0; i < PUBLIC_PROXIES.length; i++) {
      const proxyFn = PUBLIC_PROXIES[i];
      const proxyUrl = proxyFn(targetUrl);
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
          return {
            title: composeInfo.title || '未知作品',
            author: composeInfo.userObject?.nickname || '未知创作者',
            cover: composeInfo.coverKey || '',
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

  // 核心：加载并启动项目 (严格闭包隔离，不向外界暴露原始代码)
  async function loadAndRunProject(projectData, meta = {}) {
    showOverlay('正在初始化 TurboWarp 虚拟机...', '启动 JS 编译加速引擎');

    // 1. 清理已有实例
    if (state.scaffolding) {
      try {
        state.scaffolding.stopAll();
      } catch (e) {}
      dom.stageContainer.innerHTML = '';
      state.scaffolding = null;
    }

    // 2. 隐藏初始占位，创建新 Scaffolding
    dom.stagePlaceholder.style.display = 'none';

    const scaffolding = new Scaffolding.Scaffolding();
    state.scaffolding = scaffolding;

    scaffolding.width = state.stageWidth;
    scaffolding.height = state.stageHeight;
    scaffolding.resizeMode = 'preserve-ratio';
    scaffolding.editableLists = false;

    // 3. 挂载到容器
    scaffolding.setup();
    scaffolding.appendTo(dom.stageContainer);

    // 4. 配置小码王素材源
    const storage = scaffolding.storage;
    storage.addWebStore(
      [storage.AssetType.ImageVector, storage.AssetType.ImageBitmap],
      (asset) => `https://community-wscdn.xiaomawang.com/picture/${asset.assetId}.${asset.dataFormat}`
    );
    storage.addWebStore(
      [storage.AssetType.Sound],
      (asset) => `https://community-wscdn.xiaomawang.com/audio/${asset.assetId}.${asset.dataFormat}`
    );

    // 5. 应用 TurboWarp 高性能参数
    applyTurboWarpOptions(scaffolding);

    showOverlay('正在载入项目资源...', '解析角色、声音与造型素材');

    // 6. 载入项目二进制数据
    await scaffolding.loadProject(projectData);

    // 7. 更新右侧元数据信息
    updateProjectMetaUI(meta);

    hideOverlay();
    showToast('项目已成功加载并启动');

    // 8. 启动绿旗
    scaffolding.start();
    state.isPaused = false;
  }

  // 应用实时选项到虚拟机
  function applyTurboWarpOptions(scaffolding = state.scaffolding) {
    if (!scaffolding || !scaffolding.vm) return;

    const fps = state.settings.fps;
    scaffolding.vm.setFramerate(fps);
    scaffolding.vm.setInterpolation(state.settings.interpolation);
    scaffolding.renderer.setUseHighQualityRender(state.settings.hqPen);
    scaffolding.vm.setTurboMode(state.settings.turbo);
    scaffolding.vm.setRuntimeOptions({
      fencing: !state.settings.removeLimits,
      miscLimits: !state.settings.removeLimits,
      maxClones: state.settings.removeLimits ? Infinity : 300
    });

    dom.statFps.textContent = fps === 0 ? '无限制' : `${fps} FPS`;
    dom.fpsDisplay.textContent = fps === 0 ? 'MAX' : `${fps} FPS`;
  }

  // 更新元数据 UI
  function updateProjectMetaUI(meta) {
    if (meta.title) dom.metaTitle.textContent = meta.title;
    if (meta.author) dom.metaAuthor.textContent = meta.author;
    if (meta.cover) dom.metaCover.src = meta.cover;
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
      alert(`加载失败: ${err.message}\n\n提示：小码王限制了公共海外代理访问 (易报 403)。建议在右上角设置中填写个人免费 Cloudflare Worker 代理地址。`);
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

    // 4. 舞台尺寸设置切换
    dom.selectStageSize.addEventListener('change', () => {
      const val = dom.selectStageSize.value;
      if (val === 'custom') {
        dom.customSizeInputs.style.display = 'flex';
      } else {
        dom.customSizeInputs.style.display = 'none';
        const [w, h] = val.split('x').map(Number);
        setStageDimensions(w, h);
        showToast(`舞台尺寸已调整为 ${w} × ${h}`);
      }
    });

    dom.btnApplyCustomSize.addEventListener('click', () => {
      const w = parseInt(dom.inputStageW.value, 10);
      const h = parseInt(dom.inputStageH.value, 10);
      if (w >= 100 && h >= 100) {
        setStageDimensions(w, h);
        showToast(`自定义舞台尺寸已生效: ${w} × ${h}`);
      } else {
        showToast('宽高必须大于等于 100');
      }
    });

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

    dom.toggleRemoveLimits.addEventListener('change', () => {
      state.settings.removeLimits = dom.toggleRemoveLimits.checked;
      saveLocalSettings();
      applyTurboWarpOptions();
    });

    dom.toggleTurbo.addEventListener('change', () => {
      state.settings.turbo = dom.toggleTurbo.checked;
      saveLocalSettings();
      applyTurboWarpOptions();
      showToast(state.settings.turbo ? 'Turbo 极速模式已开启' : 'Turbo 模式已关闭');
    });

    // 7. 代理设置模态框
    dom.btnOpenSettings.addEventListener('click', () => {
      dom.modalSettings.classList.add('active');
    });

    const closeModal = () => dom.modalSettings.classList.remove('active');
    dom.btnCloseSettings.addEventListener('click', closeModal);
    dom.btnCancelSettings.addEventListener('click', closeModal);

    dom.selectProxyMode.addEventListener('change', () => {
      dom.customProxyRow.style.display = dom.selectProxyMode.value === 'custom' ? 'flex' : 'none';
    });

    dom.btnSaveSettings.addEventListener('click', () => {
      state.settings.proxyMode = dom.selectProxyMode.value;
      state.settings.customProxyUrl = dom.inputCustomProxy.value.trim();
      saveLocalSettings();
      updateProxyIndicator();
      closeModal();
      showToast('代理配置已保存');
    });
  }

  // 页面加载自动检测 URL 查询参数 (?id=8EKQ666J&proxy=...)
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
    checkUrlQueryParams();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
