// Initialize immediately if document is already loaded, otherwise wait for DOMContentLoaded
function initBadge() {
  let currentPath = window.location.pathname;
  let badgeUpdateTimeout = null;
  let tabClickHandler = null; // Declare early to avoid hoisting issues
  let observerTimeout = null; // Declare early to avoid hoisting issues

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
    const pathChanged = newPath !== currentPath;

    // Update current path if it changed
    if (pathChanged) {
      currentPath = newPath;
    }

    // Wrapper
    let wrapper = document.getElementById('gh-number-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'gh-number-wrapper';
      wrapper.className = 'gh-number-wrapper';
      document.body.appendChild(wrapper);
    }
    wrapper.style.display = '';

    // Big number - always update for both PRs and issues
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
      // Hide PR-specific elements for issues
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
      // Ensure wrapper is visible for issues
      wrapper.style.display = '';
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
  // Pauses when tab is hidden to save resources
  let pollInterval = null;
  let lastPollPath = window.location.pathname;
  function startPolling() {
    if (pollInterval) return;

    function pollCheck() {
      // Skip if tab is hidden
      if (document.hidden) return;

      const currentPollPath = window.location.pathname;
      const isOnIssueOrPR = currentPollPath.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/);

      // Update if path changed
      if (currentPollPath !== lastPollPath) {
        lastPollPath = currentPollPath;
        debouncedUpsertBadge();
      }
      // Or if we're on a PR/issue page and badge isn't visible (catches tab switches)
      else if (isOnIssueOrPR) {
        const wrapper = document.getElementById('gh-number-wrapper');
        if (!wrapper || wrapper.style.display === 'none') {
          debouncedUpsertBadge();
        }
      }
    }

    pollInterval = setInterval(pollCheck, 2000); // Check every 2 seconds - reduced frequency
    pollCheck(); // Run immediately
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // Manage polling, listeners, and observers based on current page
  function updatePolling() {
    const isOnIssueOrPR = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/);
    if (isOnIssueOrPR) {
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
      // Keep observer running but it will be throttled and skip processing
    }
  }

  // Pause polling when tab becomes hidden, resume when visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Tab hidden - polling will skip automatically, but we can pause observer
      if (observerTimeout) {
        clearTimeout(observerTimeout);
        observerTimeout = null;
      }
    } else {
      // Tab visible - check if we need to update
      const isOnIssueOrPR = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/);
      if (isOnIssueOrPR) {
        debouncedUpsertBadge();
      }
    }
  });

  // Initial run with retry for GitHub's dynamic loading
  upsertBadge();
  updatePolling();

  // Retry after delays to catch GitHub's async content loading
  // Multiple retries help with different loading scenarios
  [300, 800, 1500].forEach(delay => {
    setTimeout(() => {
      if (window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/)) {
        upsertBadge();
      }
    }, delay);
  });

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

  // Listen for GitHub's tab switching (they use buttons that might not trigger history events)
  // Only listen when on PR/issue pages to reduce overhead
  function setupTabListener() {
    if (tabClickHandler) return; // Already set up

    tabClickHandler = (e) => {
      // Check if clicking on a tab button or link within a PR/issue page
      const target = e.target.closest('button[data-tab], a[data-tab], [role="tab"]');
      if (target && window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/)) {
        // Small delay to let GitHub update the content
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

  // Set up listener if on PR/issue page
  if (window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/)) {
    setupTabListener();
  }

  // Watch for URL changes and content updates via MutationObserver
  // Optimized to only watch specific GitHub containers, not entire body
  let lastCheckTime = Date.now();
  let observer = null;

  function setupObserver() {
    if (observer) return; // Already set up

    observer = new MutationObserver((mutations) => {
      // Skip if tab is hidden
      if (document.hidden) return;

      const now = Date.now();
      const pathChanged = window.location.pathname !== currentPath;
      const isOnIssueOrPR = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/);

      // Only process if path changed or enough time passed (throttle)
      if (pathChanged || (isOnIssueOrPR && (now - lastCheckTime > 800))) {
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

    // Only observe the main content area, not entire body (much more efficient)
    const mainContent = document.querySelector('main, [role="main"], .js-repo-pjax-container, #js-repo-pjax-container');
    if (mainContent) {
      observer.observe(mainContent, {
        childList: true,
        subtree: false, // Only direct children, not all descendants
        attributes: false,
        characterData: false
      });
    } else {
      // Fallback: observe body but only direct children
      observer.observe(document.body, {
        childList: true,
        subtree: false, // Critical: only watch direct children, not entire tree
        attributes: false,
        characterData: false
      });
    }
  }

  function disconnectObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (observerTimeout) {
      clearTimeout(observerTimeout);
      observerTimeout = null;
    }
  }

  // Set up observer initially
  setupObserver();

  // Re-setup observer if main content appears later
  setTimeout(() => {
    if (!observer) {
      setupObserver();
    }
  }, 500);
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

// ============================================================================
// GitHub Actions Notification Monitor
// Monitors for "deploy_to_pantheon" step completion and shows browser notifications
// ============================================================================

function initActionsMonitor() {
  // Check if we're on a GitHub Actions workflow run page
  const actionsMatch = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/);
  if (!actionsMatch) {
    return; // Not on an actions page
  }

  const org = actionsMatch[1];
  const repo = actionsMatch[2];
  const runId = actionsMatch[3];
  const targetStepName = 'deploy_to_pantheon';

  let notificationPermission = Notification.permission;
  let checkedSteps = new Set(); // Track which steps we've already notified about
  let monitorInterval = null;
  let lastCheckTime = Date.now();

  // Request notification permission if not already granted/denied
  async function requestNotificationPermission() {
    if (notificationPermission === 'default') {
      try {
        notificationPermission = await Notification.requestPermission();
      } catch (err) {
        console.log('Notification permission request failed:', err);
      }
    }
    return notificationPermission === 'granted';
  }

  // Show browser notification
  function showNotification(title, body, status = 'success') {
    if (notificationPermission !== 'granted') {
      return;
    }

    const icon = status === 'success'
      ? 'https://github.githubassets.com/favicons/favicon.png'
      : 'https://github.githubassets.com/favicons/favicon.png';

    try {
      const notification = new Notification(title, {
        body: body,
        icon: icon,
        tag: `gh-actions-${runId}-${targetStepName}`, // Prevent duplicate notifications
        requireInteraction: false
      });

      // Auto-close after 10 seconds
      setTimeout(() => {
        notification.close();
      }, 10000);

      // Click handler to focus the tab
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (err) {
      console.error('Failed to show notification:', err);
    }
  }

  // Check for the deploy_to_pantheon step
  function checkDeployStep() {
    // Skip if tab is hidden (unless we're checking for the first time)
    if (document.hidden && checkedSteps.size > 0) {
      return;
    }

    // Find all job/step elements - GitHub uses various selectors
    // Try multiple selectors to find step elements
    const stepSelectors = [
      '[data-testid="workflow-run-job-step"]',
      '.TimelineItem',
      '[data-testid="job-step"]',
      'div[class*="Step"]',
      'div[class*="Job"]'
    ];

    let stepElements = [];
    for (const selector of stepSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        stepElements = Array.from(elements);
        break;
      }
    }

    // If no specific step elements found, look for any element containing the step name
    if (stepElements.length === 0) {
      // Search for text containing the step name
      const allTextElements = document.querySelectorAll('*');
      for (const el of allTextElements) {
        const text = el.textContent || '';
        if (text.includes(targetStepName) && !checkedSteps.has(el)) {
          // Check if this element or parent has status indicators
          const statusEl = el.closest('[class*="success"], [class*="failure"], [class*="completed"], [class*="error"]') ||
                          el.querySelector('[class*="success"], [class*="failure"], [class*="completed"], [class*="error"]');

          if (statusEl) {
            stepElements.push(statusEl);
          }
        }
      }
    }

    // Check each step element
    for (const stepEl of stepElements) {
      const stepText = stepEl.textContent || '';

      // Check if this step contains our target step name
      if (!stepText.includes(targetStepName)) {
        continue;
      }

      // Create a unique ID for this step instance
      const stepId = `${runId}-${stepText.substring(0, 50)}`;

      // Skip if we've already checked this step
      if (checkedSteps.has(stepId)) {
        continue;
      }

      // Check for completion status indicators
      const hasSuccess = stepEl.classList.toString().includes('success') ||
                        stepEl.classList.toString().includes('completed') ||
                        stepEl.querySelector('[class*="success"], [class*="completed"], [aria-label*="success"], [aria-label*="completed"]') ||
                        stepText.match(/success|completed|✓|check/i);

      const hasFailure = stepEl.classList.toString().includes('failure') ||
                        stepEl.classList.toString().includes('error') ||
                        stepEl.querySelector('[class*="failure"], [class*="error"], [aria-label*="failure"], [aria-label*="error"]') ||
                        stepText.match(/failure|error|✗|×|failed/i);

      // Check for in-progress status
      const isInProgress = stepEl.classList.toString().includes('running') ||
                          stepEl.classList.toString().includes('in-progress') ||
                          stepEl.querySelector('[class*="running"], [class*="in-progress"], [aria-label*="running"]') ||
                          stepText.match(/running|in progress|pending/i);

      if (hasSuccess) {
        checkedSteps.add(stepId);
        showNotification(
          'Deploy to Pantheon Complete! ✅',
          `The "${targetStepName}" step completed successfully in ${repo}`,
          'success'
        );
      } else if (hasFailure) {
        checkedSteps.add(stepId);
        showNotification(
          'Deploy to Pantheon Failed ❌',
          `The "${targetStepName}" step failed in ${repo}`,
          'failure'
        );
      } else if (!isInProgress) {
        // Step exists but status is unclear - mark as checked to avoid spam
        checkedSteps.add(stepId);
      }
    }
  }

  // Start monitoring
  async function startMonitoring() {
    // Request permission first
    const hasPermission = await requestNotificationPermission();

    if (!hasPermission) {
      console.log('Notification permission not granted. Enable notifications to receive alerts for deploy_to_pantheon step.');
      return;
    }

    // Initial check
    checkDeployStep();

    // Set up polling to check for step completion
    // Check more frequently when tab is visible
    function pollCheck() {
      if (document.hidden) {
        return; // Skip when tab is hidden
      }

      const now = Date.now();
      // Throttle checks to every 2 seconds
      if (now - lastCheckTime < 2000) {
        return;
      }
      lastCheckTime = now;

      checkDeployStep();
    }

    // Poll every 3 seconds (will be throttled internally)
    monitorInterval = setInterval(pollCheck, 3000);

    // Also watch for DOM changes that might indicate step status updates
    const observer = new MutationObserver(() => {
      if (!document.hidden) {
        checkDeployStep();
      }
    });

    // Observe the main content area for changes
    const mainContent = document.querySelector('main, [role="main"], .js-repo-pjax-container, #js-repo-pjax-container');
    if (mainContent) {
      observer.observe(mainContent, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'aria-label'] // Watch for status changes
      });
    }

    // Clean up on page navigation
    const cleanup = () => {
      if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
      }
      observer.disconnect();
    };

    // Clean up when navigating away
    window.addEventListener('beforeunload', cleanup);

    // Also check if URL changes (GitHub's SPA navigation)
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        cleanup();
      }
    }, 1000);
  }

  // Start monitoring after a short delay to let page load
  setTimeout(() => {
    startMonitoring();
  }, 1000);
}

// Initialize actions monitor
function startActionsInit() {
  if (document.body) {
    initActionsMonitor();
  } else {
    document.addEventListener('DOMContentLoaded', initActionsMonitor);
  }
}

// Start actions monitor
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startActionsInit);
} else {
  startActionsInit();
}
