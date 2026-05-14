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

  function upsertBadge() {
    const ctx = parseAdoPage();

    if (!ctx) {
      const wrapper = document.getElementById('ado-number-wrapper');
      if (wrapper) {
        wrapper.style.display = 'none';
      }
      currentLocationKey = adoLocationKey();
      return;
    }

    const newKey = adoLocationKey();
    const pathChanged = newKey !== currentLocationKey;
    if (pathChanged) {
      currentLocationKey = newKey;
    }

    let wrapper = document.getElementById('ado-number-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'ado-number-wrapper';
      wrapper.className = 'ado-number-wrapper';
      document.body.appendChild(wrapper);
    }
    wrapper.style.display = '';

    const number = ctx.number;

    let numberEl = wrapper.querySelector('.ado-number-badge');
    if (!numberEl) {
      numberEl = document.createElement('div');
      numberEl.className = 'ado-number-badge';
      wrapper.appendChild(numberEl);
    }
    numberEl.textContent = `#${number}`;

    let urlEl = wrapper.querySelector('.ado-pr-url');
    if (ctx.type === 'pull' && ctx.repo) {
      const repo = ctx.repo;
      const prUrl = `https://az-${number}-${repo}.pantheonsite.io`;
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
    } else {
      if (urlEl) {
        urlEl.style.display = 'none';
      }
      const cmdEl = wrapper.querySelector('.ado-pr-cmd');
      if (cmdEl) {
        cmdEl.style.display = 'none';
        const copiedMsg = cmdEl.querySelector('.ado-pr-cmd-copied');
        if (copiedMsg) {
          copiedMsg.classList.remove('show', 'hide');
        }
      }
      const filesLinkEl = wrapper.querySelector('.ado-pr-files-link');
      if (filesLinkEl) {
        filesLinkEl.style.display = 'none';
      }
      wrapper.style.display = '';
    }

    if (ctx.type === 'pull' && ctx.repo) {
      console.log(`ADO PR: ${ctx.org}/${ctx.project}/_git/${ctx.repo} #${number}`);
    } else {
      console.log(`ADO work item: ${ctx.org}/${ctx.project} #${number}`);
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

  let lastCheckTime = Date.now();
  let observer = null;

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
