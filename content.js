// Content script for Page Info & Cookie Manager extension
(function () {
  'use strict';

  let overlayVisible = false;
  let overlay = null;
  let cookiesContainer = null;
  let cookieButton = null;
  let hasCookiePermission = false;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Listen for show overlay event from background script
    window.addEventListener('showPageInfoOverlay', showOverlay);

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      handleBackgroundMessage(message, sender, sendResponse);
    });

    console.log('Page Info Extension content script loaded');
  }

  function injectCSS() {
    // Inject CSS if not already injected
    if (!document.getElementById('page-info-styles')) {
      const style = document.createElement('style');
      style.id = 'page-info-styles';
      style.textContent = `
/* ==========================
   Page Info Overlay Styles
   ========================== */

.page-info-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  z-index: 999999;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  animation: overlayFadeIn 0.25s ease-out;
}

/* Overlay Card */
.page-info-overlay .overlay-content {
  background: linear-gradient(180deg, #ffffff 0%, #f9fafc 100%);
  padding: 24px;
  border-radius: 16px;
  max-width: 650px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  font-family: Arial, sans-serif;
  color: #333;
  animation: scaleIn 0.25s ease-out;
}

/* Header */
.page-info-overlay .overlay-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(90deg, #007bff, #0056b3);
  color: white;
  font-weight: 600;
  padding: 10px 16px;
  border-radius: 12px;
  margin-bottom: 20px;
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.2);
}

.page-info-overlay .overlay-header h3 {
  margin: 0;
  font-size: 18px;
  color: white;
}

.page-info-overlay .overlay-header .close-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: white;
  font-weight: bold;
  transition: transform 0.2s ease;
}

.page-info-overlay .overlay-header .close-btn:hover {
  transform: rotate(90deg);
}

/* Info Sections */
.page-info-overlay .info-section {
  margin-bottom: 16px;
}

.page-info-overlay .info-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
}

.page-info-overlay .info-item label {
  font-weight: 600;
  color: #444;
}

.page-info-overlay .url-display {
  color: #007bff;
  word-break: break-all;
}

/* Cookie Section */
.page-info-overlay .cookie-section {
  margin-top: 20px;
}

.page-info-overlay .cookie-section h4 {
  margin-bottom: 12px;
  font-size: 16px;
  color: #0056b3;
  font-weight: 600;
}

.page-info-overlay .cookie-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-info-overlay .cookie-item {
  border: 1px solid #ddd;
  padding: 12px;
  border-radius: 12px;
  background: #fff;
  font-size: 13px;
  animation: itemFadeIn 0.2s ease forwards;
}

.page-info-overlay .cookie-item:nth-child(even) {
  background: #fdfdfd;
}

.page-info-overlay .cookie-name {
  font-weight: 600;
  color: #007bff;
  margin-bottom: 6px;
}

.page-info-overlay .cookie-value {
  word-break: break-all;
  margin-bottom: 8px;
  color: #555;
  font-size: 12px;
  max-height: 150px;
  overflow-y: auto;
}

.page-info-overlay .cookie-flags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.page-info-overlay .flag {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  background: #f1f1f1;
  color: #333;
}

.page-info-overlay .flag.secure {
  background: #d1f2eb;
  color: #117864;
}

.page-info-overlay .flag.httpOnly {
  background: #fdebd0;
  color: #af601a;
}

/* Buttons */
.page-info-overlay .cookie-actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}

.page-info-overlay .cookie-btn {
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.page-info-overlay .cookie-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0, 91, 187, 0.3);
}

.page-info-overlay .cookie-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* Animations */
@keyframes overlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes itemFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Responsive */
@media (max-width: 480px) {
  .page-info-overlay .overlay-content {
    border-radius: 0;
    max-width: 100%;
    max-height: 100vh;
  }

  .page-info-overlay .cookie-value {
    max-height: 100px;
  }
}
`
    }
  }

  function createOverlay() {
    // Inject CSS first
    injectCSS();

    // Create overlay container
    overlay = document.createElement('div');
    overlay.id = 'page-info-overlay';
    overlay.className = 'page-info-overlay';

    // Get page information
    const url = window.location.href;
    const domain = window.location.hostname;
    const isHttps = window.location.protocol === 'https:';

    // Fixed HTML structure to match CSS
    overlay.innerHTML = `
          <div class="overlay-content">
            <div class="overlay-header">
              <h3>Webpage Information</h3>
              <button class="close-btn" id="close-overlay">&times;</button>
            </div>

            <div class="info-section">
              <div class="info-item">
                <label>URL:</label>
                <span class="url-display" title="${escapeHtml(url)}">${escapeHtml(url)}</span>
              </div>

              <div class="info-item">
                <label>Domain:</label>
                <span>${escapeHtml(domain)}</span>
              </div>

              <div class="info-item">
                <label>HTTPS:</label>
                <span class="https-status ${isHttps ? 'secure' : 'insecure'}">
                  ${isHttps ? '✓ Secure' : '✗ Not Secure'}
                </span>
              </div>
            </div>

            <div class="cookie-section">
              <button id="cookie-button" class="cookie-btn">Grant Cookie Access</button>
              <div id="cookies-container" class="cookie-list" style="display: none;">
                <div class="cookie-controls">
                  <button id="clear-cookies-btn" class="cookie-btn" style="display: none;">Clear All Cookies</button>
                  <button id="revoke-permission-btn" class="cookie-btn" style="display: none;">Revoke Permission</button>
                </div>
                <div id="cookies-list" class="cookie-items"></div>
                <div id="cookie-status" class="cookie-status"></div>
              </div>
            </div>
          </div>
        `;

    // Add to page
    document.body.appendChild(overlay);

    // Get references to elements
    cookiesContainer = document.getElementById('cookies-container');
    cookieButton = document.getElementById('cookie-button');

    // Add event listeners
    document.getElementById('close-overlay').addEventListener('click', hideOverlay);
    cookieButton.addEventListener('click', handleCookieButtonClick);
    document.getElementById('clear-cookies-btn').addEventListener('click', clearCookies);
    document.getElementById('revoke-permission-btn').addEventListener('click', revokePermission);

    // Close overlay when clicking outside
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        hideOverlay();
      }
    });

    // Check initial permission status
    checkCookiePermission();
  }

  function showOverlay() {

    if (overlayVisible) {
      hideOverlay();
      return;
    }

    if (!overlay) {
      createOverlay();
    }

    overlay.style.display = 'flex';
    overlayVisible = true;

    // Prevent body scrolling when overlay is open
    document.body.style.overflow = 'hidden';
  }

  function hideOverlay() {
    if (overlay) {
      overlay.style.display = 'none';
    }
    overlayVisible = false;

    // Restore body scrolling
    document.body.style.overflow = '';
  }



  //CHECKING FOR COOKIE PERMISSION INITIALLY
  async function checkCookiePermission() {
    try {
      const domain = window.location.hostname;
      // console.log(domain);

      const response = await sendMessageToBackground({
        type: 'CHECK_PERMISSION',
        domain
      }).catch(() => null);

      if (response && response.granted) {
        hasCookiePermission = true;
        updateCookieButtonState(true);
      } else {
        updateCookieButtonState(false);
      }

    } catch (error) {
      console.error('Failed to check cookie permission:', error);
      updateCookieButtonState(false);
    }
  }

  async function handleCookieButtonClick() {
    const domain = window.location.hostname;

    if (!hasCookiePermission) {
      // Request permission
      cookieButton.disabled = true;
      cookieButton.textContent = 'Requesting Permission...';

      try {
        const response = await sendMessageToBackground({
          type: 'REQUEST_COOKIE_PERMISSION',
          domain: domain
        });

        if (response.success && response.granted) {
          hasCookiePermission = true;
          updateCookieButtonState(true);
          await loadCookies();
          showCookieStatus('Permission granted! Listening for cookie changes...', 'success');
        } else {
          updateCookieButtonState(false, 'Access Denied');
          showCookieStatus('Cookie permission denied. You can try again later.', 'error');
        }

      } catch (error) {
        console.error('Permission request failed:', error);
        updateCookieButtonState(false, 'Request Failed');
        showCookieStatus('Permission request failed. Please try again.', 'error');
      }

    } else {
      // Show/refresh cookies
      await loadCookies();
    }
  }

  async function loadCookies() {
    const domain = window.location.hostname;
    const cookiesList = document.getElementById('cookies-list');
    console.log('Sending GET_COOKIES request for domain:', domain);

    cookiesList.innerHTML = '<div class="loading">Loading cookies...</div>';
    cookiesContainer.style.display = 'block';

    try {
      const response = await sendMessageToBackground({
        type: 'GET_COOKIES',
        domain
      });

      if (response && response.success) {
        displayCookies(response.cookies);
        showCookieStatus(`Found ${response.cookies.length} cookies. Updates will appear automatically.`, 'info');
      } else {
        cookiesList.innerHTML = `<div class="error">Error: ${response.error || "Unknown error"}</div>`;
        showCookieStatus(`Error loading cookies: ${response.error || "Unknown error"}`, 'error');
      }

    } catch (error) {
      console.error('Failed to load cookies:', error);
      if (error.message && error.message.includes("Extension context invalidated")) {
        cookiesList.innerHTML = '<div class="error">Background worker went to sleep. Please try again.</div>';
        showCookieStatus('Background worker was inactive. Try reloading.', 'error');
      } else {
        cookiesList.innerHTML = '<div class="error">Failed to load cookies</div>';
        showCookieStatus('Failed to load cookies. Please try again.', 'error');
      }
    }
  }

  function displayCookies(cookies) {
    const cookiesList = document.getElementById('cookies-list');

    if (!cookies || cookies.length === 0) {
      cookiesList.innerHTML = '<div class="no-cookies">No cookies found for this domain</div>';
      return;
    }

    // Updated to match CSS structure
    const cookiesHtml = cookies.map(cookie => `
          <div class="cookie-item">
            <div class="cookie-name">${escapeHtml(cookie.name)}</div>
            <div class="cookie-value">${escapeHtml(cookie.value)}</div>
            <div class="cookie-flags">
              ${cookie.secure ? '<span class="flag secure">Secure</span>' : ''}
              ${cookie.httpOnly ? '<span class="flag httpOnly">HttpOnly</span>' : ''}
              ${cookie.sameSite ? `<span class="flag same-site">SameSite: ${cookie.sameSite}</span>` : ''}
            </div>
            <div class="cookie-details">
              <span>Domain: ${escapeHtml(cookie.domain)}</span>
              <span>Path: ${escapeHtml(cookie.path)}</span>
              ${cookie.expirationDate ?
        `<span>Expires: ${new Date(cookie.expirationDate * 1000).toLocaleString()}</span>` :
        '<span>Session Cookie</span>'
      }
            </div>
          </div>
        `).join('');

    cookiesList.innerHTML = cookiesHtml;
  }

  async function clearCookies() {
    const domain = window.location.hostname;

    if (!confirm(`Are you sure you want to clear all cookies for ${domain}?`)) {
      return;
    }

    try {
      const response = await sendMessageToBackground({
        type: 'CLEAR_COOKIES',
        domain: domain
      });

      if (response.success) {
        showCookieStatus(response.message, 'success');
        await loadCookies(); // Refresh the list
      } else {
        showCookieStatus(`Error: ${response.error}`, 'error');
      }

    } catch (error) {
      console.error('Failed to clear cookies:', error);
      showCookieStatus('Failed to clear cookies', 'error');
    }
  }

  async function revokePermission() {
    const domain = window.location.hostname;

    if (!confirm(`Revoke cookie permission for ${domain}?`)) {
      return;
    }

    try {
      const response = await sendMessageToBackground({
        type: 'REVOKE_PERMISSION',
        domain: domain
      });

      if (response.success && response.removed) {
        hasCookiePermission = false;
        updateCookieButtonState(false);
        cookiesContainer.style.display = 'none';
        showCookieStatus('Permission revoked successfully', 'success');
      } else {
        showCookieStatus('Failed to revoke permission', 'error');
      }

    } catch (error) {
      console.error('Failed to revoke permission:', error);
      showCookieStatus('Failed to revoke permission', 'error');
    }
  }

  function updateCookieButtonState(hasPermission, customText = null) {
    hasCookiePermission = hasPermission;
    cookieButton.disabled = false;

    if (customText) {
      cookieButton.textContent = customText;
      cookieButton.disabled = customText.includes('Denied') || customText.includes('Failed');
    } else if (hasPermission) {
      cookieButton.textContent = 'Show Cookies';
      document.getElementById('clear-cookies-btn').style.display = 'inline-block';
      document.getElementById('revoke-permission-btn').style.display = 'inline-block';
    } else {
      cookieButton.textContent = 'Grant Cookie Access';
      document.getElementById('clear-cookies-btn').style.display = 'none';
      document.getElementById('revoke-permission-btn').style.display = 'none';
    }
  }

  function showCookieStatus(message, type = 'info') {
    const statusElement = document.getElementById('cookie-status');
    if (!statusElement) return;

    statusElement.textContent = message;
    statusElement.className = `cookie-status ${type}`;
    statusElement.style.display = 'block';

    // Auto-hide after 5 seconds for success/info messages
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        statusElement.style.display = 'none';
      }, 5000);
    }
  }

  function handleBackgroundMessage(message, sender, sendResponse) {
    console.log('Content script received message:', message);

    switch (message.type) {
      case 'COOKIES_UPDATED':
        if (overlayVisible && cookiesContainer && cookiesContainer.style.display === 'block') {
          displayCookies(message.cookies);

          const changeInfo = message.changeInfo;
          if (changeInfo) {
            const action = changeInfo.removed ? 'removed' : 'updated';
            const cookieName = changeInfo.cookie ? changeInfo.cookie.name : 'unknown';
            showCookieStatus(`Cookie "${cookieName}" was ${action}`, 'info');
          } else {
            showCookieStatus('Cookies updated', 'info');
          }
        }
        break;

      case 'PERMISSION_CHANGED':
        if (message.granted) {
          hasCookiePermission = true;
          updateCookieButtonState(true);
          showCookieStatus('Cookie permission granted', 'success');
        } else {
          hasCookiePermission = false;
          updateCookieButtonState(false);
          showCookieStatus('Cookie permission revoked', 'info');
        }
        break;

      default:
        console.log('Unknown message from background:', message);
    }
  }

  function sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

})();





