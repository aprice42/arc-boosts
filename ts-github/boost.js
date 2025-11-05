// Initialize immediately if document is already loaded, otherwise wait for DOMContentLoaded
function initBadge() {
  let currentPath = window.location.pathname;
  let badgeUpdateTimeout = null;

  function upsertBadge() {
    const m = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/);

    // Clear badge if we're not on an issue/PR page
    if (!m) {
      const wrapper = document.getElementById('gh-number-wrapper');
      if (wrapper) {
        wrapper.style.display = 'none';
      }
      currentPath = window.location.pathname;
      return;
    }

    const org = m[1];
    const projectName = m[2];
    const type = m[3];
    const number = m[4];
    const newPath = window.location.pathname;

    // Skip if we're already showing the correct badge
    if (newPath === currentPath) {
      return;
    }
    currentPath = newPath;

    // Wrapper
    let wrapper = document.getElementById('gh-number-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'gh-number-wrapper';
      wrapper.className = 'gh-number-wrapper';
      document.body.appendChild(wrapper);
    }
    wrapper.style.display = '';

    // Big number
    let numberEl = wrapper.querySelector('.gh-number-badge');
    if (!numberEl) {
      numberEl = document.createElement('div');
      numberEl.className = 'gh-number-badge';
      wrapper.appendChild(numberEl);
    }
    numberEl.textContent = `#${number}`;

    // Pantheon URL (PRs only)
    let urlEl = wrapper.querySelector('.gh-pr-url');
    if (type === 'pull') {
      const prUrl = `https://pr-${number}-${projectName}.pantheonsite.io`;
      if (!urlEl) {
        urlEl = document.createElement('a');
        urlEl.className = 'gh-pr-url';
        urlEl.target = '_blank';
        wrapper.appendChild(urlEl);
      }
      urlEl.href = prUrl;
      urlEl.textContent = prUrl;
      urlEl.style.display = '';

      // Terminal command snippet (PRs only)
      let cmdEl = wrapper.querySelector('.gh-pr-cmd');
      const cmdText = `tdr ${projectName}.pr-${number} uli`;
      if (!cmdEl) {
        cmdEl = document.createElement('code');
        cmdEl.className = 'gh-pr-cmd';
        cmdEl.setAttribute('title', 'Click to copy');
        cmdEl.style.cursor = 'pointer';
        wrapper.appendChild(cmdEl);

        // Add click handler to copy to clipboard
        cmdEl.addEventListener('click', async function() {
          // Get command text from data attribute to avoid including "Copied!" message
          const textToCopy = this.dataset.cmdText || this.textContent.replace(/Copied!/g, '').trim();
          try {
            await navigator.clipboard.writeText(textToCopy);
            showCopiedMessage(cmdEl);
          } catch (err) {
            // Fallback for older browsers
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
      // Store command text in data attribute and set text content
      cmdEl.dataset.cmdText = cmdText;
      cmdEl.textContent = cmdText;
      cmdEl.style.display = '';

      // "Copied" message element (appended to cmdEl so it's positioned relative to it)
      let copiedMsg = cmdEl.querySelector('.gh-pr-cmd-copied');
      if (!copiedMsg) {
        copiedMsg = document.createElement('span');
        copiedMsg.className = 'gh-pr-cmd-copied';
        cmdEl.appendChild(copiedMsg);
      }

      // View Raw Diff link (PRs only)
      let diffLinkEl = wrapper.querySelector('.gh-pr-diff-link');
      const diffUrl = `https://github.com/${org}/${projectName}/pull/${number}.diff`;
      if (!diffLinkEl) {
        diffLinkEl = document.createElement('a');
        diffLinkEl.className = 'gh-pr-diff-link';
        diffLinkEl.target = '_blank';
        diffLinkEl.href = diffUrl;
        diffLinkEl.textContent = 'View Raw Diff';
        wrapper.appendChild(diffLinkEl);
      } else {
        diffLinkEl.href = diffUrl;
      }
      diffLinkEl.style.display = '';
    } else {
      if (urlEl) {
        urlEl.style.display = 'none';
      }
      const cmdEl = wrapper.querySelector('.gh-pr-cmd');
      if (cmdEl) {
        cmdEl.style.display = 'none';
        const copiedMsg = cmdEl.querySelector('.gh-pr-cmd-copied');
        if (copiedMsg) {
          copiedMsg.classList.remove('show', 'hide');
        }
      }
      const diffLinkEl = wrapper.querySelector('.gh-pr-diff-link');
      if (diffLinkEl) {
        diffLinkEl.style.display = 'none';
      }
    }

    console.log(`Repo: ${org}/${projectName} | ${type} #${number}`);
  }

  // Show "copied" message temporarily
  let copiedMessageTimeout = null;
  function showCopiedMessage(element) {
    const copiedMsg = element.querySelector('.gh-pr-cmd-copied');
    if (!copiedMsg) return;

    // Remove any existing classes
    copiedMsg.classList.remove('show', 'hide');

    // Set text and trigger animation
    copiedMsg.textContent = 'Copied!';

    // Force reflow to ensure the element is ready for animation
    void copiedMsg.offsetWidth;

    // Add show class to animate up
    copiedMsg.classList.add('show');

    // Clear any existing timeout
    if (copiedMessageTimeout) {
      clearTimeout(copiedMessageTimeout);
    }

    // Hide after 2 seconds with fade out and slide down
    copiedMessageTimeout = setTimeout(() => {
      copiedMsg.classList.remove('show');
      copiedMsg.classList.add('hide');

      // Remove hide class after animation completes
      setTimeout(() => {
        copiedMsg.classList.remove('hide');
      }, 300); // Match transition duration
    }, 2000);
  }

  // Debounced badge update function
  function debouncedUpsertBadge() {
    if (badgeUpdateTimeout) {
      clearTimeout(badgeUpdateTimeout);
    }
    badgeUpdateTimeout = setTimeout(() => {
      requestAnimationFrame(upsertBadge);
    }, 100);
  }

  // Fallback: lightweight polling as last resort (only runs if on issue/PR page)
  let pollInterval = null;
  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(() => {
      if (window.location.pathname !== currentPath) {
        debouncedUpsertBadge();
      }
    }, 1000); // Check every second - very lightweight
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // Manage polling based on current page
  function updatePolling() {
    const isOnIssueOrPR = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/);
    if (isOnIssueOrPR && !pollInterval) {
      startPolling();
    } else if (!isOnIssueOrPR && pollInterval) {
      stopPolling();
    }
  }

  // Initial run with retry for GitHub's dynamic loading
  upsertBadge();
  updatePolling();

  // Retry after a short delay to catch GitHub's async content loading
  setTimeout(() => {
    if (window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/)) {
      upsertBadge();
    }
  }, 300);

  // Keep badge updated on GitHub's client-side navigation
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

  // Watch for URL changes via MutationObserver (for GitHub's Turbo/navigation)
  // Throttle to avoid excessive calls
  let observerTimeout = null;
  const observer = new MutationObserver(() => {
    if (window.location.pathname !== currentPath) {
      if (observerTimeout) {
        clearTimeout(observerTimeout);
      }
      observerTimeout = setTimeout(() => {
        debouncedUpsertBadge();
        updatePolling();
      }, 200);
    }
  });

  // Observe the document body for changes (GitHub updates content on navigation)
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize badge with multiple strategies to handle GitHub's dynamic loading
function startInit() {
  // If body exists and is ready, initialize
  if (document.body) {
    initBadge();
  } else {
    // Wait for body to be available
    const bodyObserver = new MutationObserver(function(mutations, obs) {
      if (document.body) {
        obs.disconnect();
        initBadge();
      }
    });
    bodyObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    // Fallback: try after a delay
    setTimeout(() => {
      if (document.body && !document.getElementById('gh-number-wrapper')) {
        bodyObserver.disconnect();
        initBadge();
      }
    }, 500);
  }
}

// Run immediately if document is already loaded (for page refreshes)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startInit);
} else {
  // Document is already loaded, run immediately
  startInit();
}
