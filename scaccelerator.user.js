// ==UserScript==
// @name         小码王 Scratch TurboWarp 加速器
// @namespace    https://github.com/XRJprogram/scaccelerator
// @version      1.0.0
// @description  在小码王社区作品页面添加 TurboWarp 60帧/JS编译高速运行按钮，畅享极致丝滑体验！
// @author       XRJ
// @match        https://world.xiaomawang.com/community/main/compose/*
// @match        https://world.xiaomawang.com/community/main/create/*
// @icon         https://turbowarp.org/favicon.ico
// @grant        GM_openInTab
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const ACCELERATOR_URL = 'https://xrjprogram.github.io/scaccelerator/';

  function getCompositionId() {
    const match = window.location.pathname.match(/\/compose\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  function injectButton() {
    if (document.getElementById('scaccelerator-btn')) return;

    const id = getCompositionId();
    if (!id) return;

    // 寻找操作栏或播放器区域
    const targetContainer =
      document.querySelector('.work-operation') ||
      document.querySelector('.compose-detail-actions') ||
      document.querySelector('.author-action') ||
      document.querySelector('.detail-title-box') ||
      document.body;

    const btn = document.createElement('button');
    btn.id = 'scaccelerator-btn';
    btn.innerHTML = `TurboWarp 播放器 (60FPS)`;

    Object.assign(btn.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#2563eb',
      color: '#ffffff',
      fontWeight: '500',
      fontSize: '13px',
      padding: '6px 14px',
      borderRadius: '6px',
      border: '1px solid #1d4ed8',
      cursor: 'pointer',
      margin: '6px 10px',
      transition: 'background-color 0.15s ease',
      zIndex: '9999',
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = '#1d4ed8';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = '#2563eb';
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = `${ACCELERATOR_URL}?id=${encodeURIComponent(id)}`;
      if (typeof GM_openInTab !== 'undefined') {
        GM_openInTab(target, { active: true });
      } else {
        window.open(target, '_blank');
      }
    });

    if (targetContainer === document.body) {
      btn.style.position = 'fixed';
      btn.style.bottom = '24px';
      btn.style.right = '24px';
      document.body.appendChild(btn);
    } else {
      targetContainer.appendChild(btn);
    }
  }

  // 轮询检测单页路由更新
  setInterval(injectButton, 1000);
})();
