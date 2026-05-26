// ==UserScript==
// @name         ADO Badge
// @namespace    thinkshout
// @version      1.1
// @description  PR and work item badge for Azure DevOps
// @author       Andy
// @match        https://dev.azure.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Toggle individual features here. Flip to `false` to disable.
    const FEATURES = {
      prOverrides: true,
      storyOverrides: true,
      harvestIntegration: true,
    };

    function isAdoBoostHost() {
  const h = window.location.hostname;
  return h === 'dev.azure.com' || h === 'www.dev.azure.com';
}

function adoLocationKey() {
  return window.location.pathname + window.location.search;
}

/**
 * @returns {null | { type: 'pull' | 'workitem', org: string, project: string, repo?: string, number: string, filesUrl?: string }}
 */
function parseAdoPage() {
  if (!isAdoBoostHost()) {
    return null;
  }

  const pathname = window.location.pathname;
  const sp = new URLSearchParams(window.location.search);

  const prMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/);
  if (prMatch) {
    const org = prMatch[1];
    const project = prMatch[2];
    const repo = prMatch[3];
    const number = prMatch[4];
    const basePathMatch = pathname.match(/^(.+\/pullrequest\/\d+)/);
    const basePath = basePathMatch ? basePathMatch[1] : pathname;
    const filesUrl = new URL(basePath, window.location.origin);
    filesUrl.searchParams.set('_a', 'files');
    return { type: 'pull', org, project, repo, number, filesUrl: filesUrl.toString() };
  }

  const editMatch = pathname.match(/\/_workitems\/edit\/(\d+)/);
  if (editMatch) {
    const number = editMatch[1];
    const seg = pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/);
    const org = seg ? seg[1] : '';
    const project = seg ? seg[2] : '';
    return { type: 'workitem', org, project, number };
  }

  const workitemParam = sp.get('workitem');
  if (workitemParam && /^\d+$/.test(workitemParam)) {
    const seg = pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/);
    const org = seg ? seg[1] : '';
    const project = seg ? seg[2] : '';
    return { type: 'workitem', org, project, number: workitemParam };
  }

  const idParam = sp.get('id');
  if (idParam && /^\d+$/.test(idParam)) {
    const pathHint =
      pathname.includes('_boards') ||
      pathname.includes('_workitems') ||
      pathname.includes('_sprints') ||
      pathname.includes('/backlog') ||
      pathname.includes('_work/');
    if (pathHint) {
      const seg = pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/);
      const org = seg ? seg[1] : '';
      const project = seg ? seg[2] : '';
      return { type: 'workitem', org, project, number: idParam };
    }
  }

  return null;
}

function initBadge() {
  let currentLocationKey = adoLocationKey();
  let badgeUpdateTimeout = null;
  let tabClickHandler = null;
  let observerTimeout = null;
  let observer = null;
  let lastCheckTime = Date.now();

  // Inject all styles
  if (!document.getElementById('ado-badge-styles')) {
    const style = document.createElement('style');
    style.id = 'ado-badge-styles';
    style.textContent = `
      .ado-number-wrapper {
        position: fixed;
        bottom: 5%;
        left: 1%;
        z-index: 2147483647;
        text-align: left;
        line-height: 1.0;
        pointer-events: none;
      }
      .ado-number-badge {
        color: #ededed;
        font-size: 200px;
        font-weight: bold;
        opacity: .3;
        pointer-events: none;
      }
      .ado-pr-url {
        display: inline-block;
        margin-top: 8px;
        color: #ededed;
        font-size: 20px;
        font-weight: 600;
        opacity: .35;
        text-decoration: none;
        pointer-events: auto;
      }
      .ado-pr-url:hover {
        text-decoration: underline;
        opacity: .5;
      }
      .ado-pr-cmd {
        display: block;
        margin-top: 8px;
        color: #ededed;
        font-size: 16px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
        font-weight: 400;
        opacity: .3;
        user-select: all;
        cursor: pointer;
        transition: opacity 0.2s ease;
        position: relative;
        pointer-events: auto;
      }
      .ado-pr-cmd:hover {
        opacity: .4;
      }
      .ado-pr-cmd-copied {
        display: block;
        color: #ededed;
        font-size: 14px;
        font-weight: 500;
        opacity: 0;
        pointer-events: none;
        user-select: none;
        text-align: right;
        position: absolute;
        bottom: 100%;
        right: 0;
        margin-bottom: 8px;
        white-space: nowrap;
        transform: translateY(10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      .ado-pr-cmd-copied.show {
        opacity: 1;
        transform: translateY(0);
      }
      .ado-pr-cmd-copied.hide {
        opacity: 0;
        transform: translateY(10px);
      }
      .ado-pr-files-link {
        display: inline-block;
        margin-top: 8px;
        color: #ededed;
        font-size: 16px;
        font-weight: 500;
        opacity: .3;
        text-decoration: none;
        pointer-events: auto;
      }
      .ado-pr-files-link:hover {
        text-decoration: underline;
        opacity: .45;
      }
      #ado-harvest-timer.harvest-timer {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0 8px;
        padding: 6px 12px;
        background: #2a2a2a;
        color: #ededed;
        border: 1px solid #3a3a3a;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
        vertical-align: middle;
        font-family: inherit;
        line-height: 1.5;
      }
      #ado-harvest-timer.harvest-timer:hover {
        background: #353535;
        border-color: #4a4a4a;
      }
      #ado-harvest-timer.harvest-timer .ado-harvest-content {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      #ado-harvest-timer.harvest-timer svg {
        fill: currentColor;
        flex-shrink: 0;
      }
      #ado-harvest-timer.harvest-timer.running {
        background: #1385e5;
        border-color: #075fa9;
        color: #fff;
      }
      #ado-harvest-timer.harvest-timer.running:hover {
        background: #0e7add;
      }
    `;
    document.head.appendChild(style);
  }

    function getWorkItemTitle() {
        // ADO renders the title in a few different selectors depending on view
        const selectors = [
            '.work-item-title-textfield > input',
            '.work-item-title-textfield input',
            'input[aria-label="Title Field"]',
            '.work-item-form-title input',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.value && el.value.trim()) {
                return el.value.trim();
            }
        }
        return null;
    }

    function getCommandBar() {
        return document.querySelector('.work-item-header-command-bar');
    }

    function loadHarvestPlatform() {
        if (document.querySelector('script[src*="platform.harvestapp.com"]')) {
            // Already loaded — tell it to re-scan for new timer elements
            if (window.HarvestPlatform) {
                window.HarvestPlatform.findTimers();
            }
            return;
        }
        window._harvestPlatformConfig = {
            applicationName: 'Azure DevOps',
            permalink: window.location.href,
        };
        const s = document.createElement('script');
        s.src = 'https://platform.harvestapp.com/assets/platform.js';
        s.async = true;
        document.head.appendChild(s);
    }

  function hideWrapper() {
    const wrapper = document.getElementById('ado-number-wrapper');
    if (wrapper) wrapper.style.display = 'none';
  }

  function hidePrExtras() {
    const wrapper = document.getElementById('ado-number-wrapper');
    if (!wrapper) return;
    const urlEl = wrapper.querySelector('.ado-pr-url');
    if (urlEl) urlEl.style.display = 'none';
    const cmdEl = wrapper.querySelector('.ado-pr-cmd');
    if (cmdEl) {
      cmdEl.style.display = 'none';
      const copiedMsg = cmdEl.querySelector('.ado-pr-cmd-copied');
      if (copiedMsg) copiedMsg.classList.remove('show', 'hide');
    }
    const filesLinkEl = wrapper.querySelector('.ado-pr-files-link');
    if (filesLinkEl) filesLinkEl.style.display = 'none';
  }

  function hideHarvest() {
    const harvestEl = document.getElementById('ado-harvest-timer');
    if (harvestEl) harvestEl.style.display = 'none';
  }

  function renderNumberBadge(number) {
    let wrapper = document.getElementById('ado-number-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'ado-number-wrapper';
      wrapper.className = 'ado-number-wrapper';
      document.body.appendChild(wrapper);
    }
    wrapper.style.display = '';

    let numberEl = wrapper.querySelector('.ado-number-badge');
    if (!numberEl) {
      numberEl = document.createElement('div');
      numberEl.className = 'ado-number-badge';
      wrapper.appendChild(numberEl);
    }
    numberEl.textContent = `#${number}`;
    return wrapper;
  }

  function renderPrExtras(ctx, wrapper) {
    const number = ctx.number;
    const repo = ctx.repo;
    const prUrl = `https://az-${number}-${repo}.pantheonsite.io`;

    let urlEl = wrapper.querySelector('.ado-pr-url');
    if (!urlEl) {
      urlEl = document.createElement('a');
      urlEl.className = 'ado-pr-url';
      urlEl.target = '_blank';
      wrapper.appendChild(urlEl);
    }
    urlEl.href = prUrl;
    urlEl.textContent = prUrl;
    urlEl.style.display = '';

    let cmdEl = wrapper.querySelector('.ado-pr-cmd');
    const cmdText = `tdr ${repo}.az-${number} uli`;
    if (!cmdEl) {
      cmdEl = document.createElement('code');
      cmdEl.className = 'ado-pr-cmd';
      cmdEl.setAttribute('title', 'Click to copy');
      cmdEl.style.cursor = 'pointer';
      wrapper.appendChild(cmdEl);

      cmdEl.addEventListener('click', async function () {
        const textToCopy = this.dataset.cmdText || this.textContent.replace(/Copied!/g, '').trim();
        try {
          await navigator.clipboard.writeText(textToCopy);
          showCopiedMessage(cmdEl);
        } catch (err) {
          const textArea = document.createElement('textarea');
          textArea.value = textToCopy;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.select();
          try {
            document.execCommand('copy');
            showCopiedMessage(cmdEl);
          } catch (fallbackErr) {
            console.error('Failed to copy:', fallbackErr);
          }
          document.body.removeChild(textArea);
        }
      });
    }
    cmdEl.dataset.cmdText = cmdText;
    cmdEl.textContent = cmdText;
    cmdEl.style.display = '';

    let copiedMsg = cmdEl.querySelector('.ado-pr-cmd-copied');
    if (!copiedMsg) {
      copiedMsg = document.createElement('span');
      copiedMsg.className = 'ado-pr-cmd-copied';
      cmdEl.appendChild(copiedMsg);
    }

    let filesLinkEl = wrapper.querySelector('.ado-pr-files-link');
    const filesUrl = ctx.filesUrl || window.location.href;
    if (!filesLinkEl) {
      filesLinkEl = document.createElement('a');
      filesLinkEl.className = 'ado-pr-files-link';
      filesLinkEl.target = '_blank';
      filesLinkEl.textContent = 'View PR files';
      wrapper.appendChild(filesLinkEl);
    }
    filesLinkEl.href = filesUrl;
    filesLinkEl.style.display = '';
  }

  function renderHarvestTimer(ctx) {
    const commandBar = getCommandBar();
    let harvestEl = document.getElementById('ado-harvest-timer');

    if (!commandBar) {
      // Command bar not in DOM yet — hide any stray timer until it appears
      if (harvestEl) harvestEl.style.display = 'none';
      return;
    }

    // If the timer exists but isn't in the command bar (or is in a stale one), move it
    if (!harvestEl || harvestEl.parentElement !== commandBar) {
      if (harvestEl) harvestEl.remove();
      harvestEl = document.createElement('button');
      harvestEl.type = 'button';
      harvestEl.id = 'ado-harvest-timer';
      harvestEl.className = 'harvest-timer';
      harvestEl.dataset.skipStyling = 'true';
      harvestEl.innerHTML = `
        <span class="ado-harvest-content">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"></path>
          </svg>
          <span class="ado-harvest-label">Track time</span>
        </span>
      `;
      commandBar.appendChild(harvestEl);
    }

    const title = getWorkItemTitle();
    const itemName = title ? `#${ctx.number} ${title}` : `#${ctx.number}`;
    harvestEl.dataset.item = JSON.stringify({ id: ctx.number, name: itemName });
    harvestEl.dataset.permalink = window.location.href;
    harvestEl.style.display = '';
    loadHarvestPlatform();

    if (!title) {
      let retries = 0;
      const titleRetry = setInterval(() => {
        retries++;
        const lateTitle = getWorkItemTitle();
        if (lateTitle) {
          const el = document.getElementById('ado-harvest-timer');
          if (el) {
            el.dataset.item = JSON.stringify({ id: ctx.number, name: `#${ctx.number} ${lateTitle}` });
          }
          clearInterval(titleRetry);
        } else if (retries >= 20) {
          clearInterval(titleRetry);
        }
      }, 250);
    }
  }

  function upsertBadge() {
    const ctx = parseAdoPage();

    if (!ctx) {
      hideWrapper();
      hideHarvest();
      currentLocationKey = adoLocationKey();
      return;
    }

    const newKey = adoLocationKey();
    if (newKey !== currentLocationKey) {
      currentLocationKey = newKey;
    }

    const isPr = ctx.type === 'pull' && !!ctx.repo;
    const isWorkItem = ctx.type === 'workitem';

    const showNumberBadge =
      (isPr && FEATURES.prOverrides) ||
      (isWorkItem && FEATURES.storyOverrides);

    const wrapper = showNumberBadge ? renderNumberBadge(ctx.number) : null;
    if (!showNumberBadge) hideWrapper();

    if (isPr && FEATURES.prOverrides && wrapper) {
      renderPrExtras(ctx, wrapper);
    } else {
      hidePrExtras();
    }

    if (isWorkItem && FEATURES.harvestIntegration) {
      renderHarvestTimer(ctx);
    } else {
      hideHarvest();
    }

    if (isPr) {
      console.log(`ADO PR: ${ctx.org}/${ctx.project}/_git/${ctx.repo} #${ctx.number}`);
    } else {
      console.log(`ADO work item: ${ctx.org}/${ctx.project} #${ctx.number}`);
    }
  }

  let copiedMessageTimeout = null;
  function showCopiedMessage(element) {
    const copiedMsg = element.querySelector('.ado-pr-cmd-copied');
    if (!copiedMsg) return;

    copiedMsg.classList.remove('show', 'hide');
    copiedMsg.textContent = 'Copied!';
    void copiedMsg.offsetWidth;
    copiedMsg.classList.add('show');

    if (copiedMessageTimeout) {
      clearTimeout(copiedMessageTimeout);
    }

    copiedMessageTimeout = setTimeout(() => {
      copiedMsg.classList.remove('show');
      copiedMsg.classList.add('hide');

      setTimeout(() => {
        copiedMsg.classList.remove('hide');
      }, 300);
    }, 2000);
  }

  function debouncedUpsertBadge() {
    if (badgeUpdateTimeout) {
      clearTimeout(badgeUpdateTimeout);
    }
    badgeUpdateTimeout = setTimeout(() => {
      requestAnimationFrame(upsertBadge);
    }, 100);
  }

  let pollInterval = null;
  let lastPollKey = adoLocationKey();

  function startPolling() {
    if (pollInterval) return;

    function pollCheck() {
      if (document.hidden) return;

      const currentKey = adoLocationKey();
      const onTarget = parseAdoPage();

      if (currentKey !== lastPollKey) {
        lastPollKey = currentKey;
        debouncedUpsertBadge();
      } else if (onTarget) {
        const wrapper = document.getElementById('ado-number-wrapper');
        if (!wrapper || wrapper.style.display === 'none') {
          debouncedUpsertBadge();
        }
      }
    }

    pollInterval = setInterval(pollCheck, 2000);
    pollCheck();
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function updatePolling() {
    if (parseAdoPage()) {
      if (!pollInterval) {
        startPolling();
      }
      setupTabListener();
      setupObserver();
    } else {
      if (pollInterval) {
        stopPolling();
      }
      removeTabListener();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (observerTimeout) {
        clearTimeout(observerTimeout);
        observerTimeout = null;
      }
    } else {
      if (parseAdoPage()) {
        debouncedUpsertBadge();
      }
    }
  });

  upsertBadge();
  updatePolling();

  [300, 800, 1500].forEach(delay => {
    setTimeout(() => {
      if (parseAdoPage()) {
        upsertBadge();
      }
    }, delay);
  });

  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function () {
    origPush.apply(this, arguments);
    debouncedUpsertBadge();
    updatePolling();
  };

  history.replaceState = function () {
    origReplace.apply(this, arguments);
    debouncedUpsertBadge();
    updatePolling();
  };

  window.addEventListener('popstate', () => {
    debouncedUpsertBadge();
    updatePolling();
  });

  function setupTabListener() {
    if (tabClickHandler) return;

    tabClickHandler = e => {
      const target = e.target.closest('button[data-tab], a[data-tab], [role="tab"]');
      if (target && parseAdoPage()) {
        setTimeout(() => {
          debouncedUpsertBadge();
        }, 100);
      }
    };
    document.addEventListener('click', tabClickHandler, true);
  }

  function removeTabListener() {
    if (tabClickHandler) {
      document.removeEventListener('click', tabClickHandler, true);
      tabClickHandler = null;
    }
  }

  if (parseAdoPage()) {
    setupTabListener();
  }

  function adoObserverRoot() {
    return document.querySelector(
      'main, [role="main"], .page-content, .repos-pr-page, .bolt-page, .hub-view, [data-rendered-region="content"]'
    );
  }

  function setupObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      if (document.hidden) return;

      const now = Date.now();
      const key = adoLocationKey();
      const keyChanged = key !== currentLocationKey;
      const onTarget = parseAdoPage();

      if (keyChanged || (onTarget && now - lastCheckTime > 800)) {
        lastCheckTime = now;
        if (observerTimeout) {
          clearTimeout(observerTimeout);
        }
        observerTimeout = setTimeout(() => {
          debouncedUpsertBadge();
          updatePolling();
        }, 300);
      }
    });

    const mainContent = adoObserverRoot();
    if (mainContent) {
      observer.observe(mainContent, {
        childList: true,
        subtree: false,
        attributes: false,
        characterData: false
      });
    } else {
      observer.observe(document.body, {
        childList: true,
        subtree: false,
        attributes: false,
        characterData: false
      });
    }
  }

  setupObserver();

  setTimeout(() => {
    if (!observer) {
      setupObserver();
    }
  }, 500);
}

function startInit() {
  if (!isAdoBoostHost()) {
    return;
  }

  if (!FEATURES.prOverrides && !FEATURES.storyOverrides && !FEATURES.harvestIntegration) {
    return;
  }

  if (document.body) {
    initBadge();
  } else {
    const bodyObserver = new MutationObserver(function (mutations, obs) {
      if (document.body) {
        obs.disconnect();
        initBadge();
      }
    });
    bodyObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      if (document.body && !document.getElementById('ado-number-wrapper')) {
        bodyObserver.disconnect();
        initBadge();
      }
    }, 500);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startInit);
} else {
  startInit();
}

})();
