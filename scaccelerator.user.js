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
    btn.innerHTML = `
      <svg style="width:16px;height:16px;vertical-align:-2px;margin-right:6px;fill:currentColor;" viewBox="0 0 24 24">
        <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
      </svg>
      TurboWarp 加速运行 (60帧)
    `;

    Object.assign(btn.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #ff4b4b 0%, #ff8533 100%)',
      color: '#ffffff',
      fontWeight: 'bold',
      fontSize: '14px',
      padding: '8px 16px',
      borderRadius: '20px',
      border: 'none',
      boxShadow: '0 4px 12px rgba(255, 75, 75, 0.4)',
      cursor: 'pointer',
      margin: '8px 12px',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      zIndex: '9999',
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-2px) scale(1.03)';
      btn.style.boxShadow = '0 6px 16px rgba(255, 75, 75, 0.6)';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0) scale(1)';
      btn.style.boxShadow = '0 4px 12px rgba(255, 75, 75, 0.4)';
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
