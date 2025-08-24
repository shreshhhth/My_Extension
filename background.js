//For handling cookies and permissions
let cookiesPermissionStatus = new Map();
const cookieListeners = new Map();

//FOR EXTENSION ICON CLICK EVENT IN BROWSER
chrome.action.onClicked.addListener(async (tab) => {
    console.log("User has clicked icon on tab:", tab);

    //INJECTING THE SCRIPT WHEN CLICKED ON EXTENSION
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: showOverlay,
        });
        // console.log('Successfully injected ');

    } catch (error) {
        console.error("FAILED TO INJECT THE CONTENT SCRIPT", error);
    }
});

//OVERLAY FUNCTION
function showOverlay() {
    const event = new CustomEvent('showPageInfoOverlay'); //OUR OWN CUSTOM EVENT JUST LIKE "CLICK", "KEYDOWN", ETC.
    window.dispatchEvent(event);
}

//LISTEN TO MESSAGES FROM CONTENT SCRIPT
chrome.runtime.onMessage.addListener((message, sender, response) => {
    console.log("background received message: ", message);

    switch (message.type) {
        case 'REQUEST_COOKIE_PERMISSION':
            handleCookiePermissionRequest(message, sender, response);
            return true;

        case 'CHECK_PERMISSION':
            const { domain } = message;
            const granted = cookiesPermissionStatus.get(domain) || false
            response({ granted })
            return true;

        case 'GET_COOKIES':
            handleGetCookies(message, sender, response);
            return true;

        case 'CLEAR_COOKIES':
            handleClearCookies(message, sender, response);
            return true;

        case 'REVOKE_PERMISSION':
            handleRevokePermission(message, sender, response);
            return true;

        default:
            console.warn('Unknown message type:', message.type);
    }
});

//---------------------------------ALL COOKIES HANDLES FUNCTION----------------------------



async function handleCookiePermissionRequest(message, sender, response) {
    try {
        const domain = message.domain;
        const tabId = sender.tab.id;
        console.log('Requesting permission for domain:', domain);

        // For optional permissions, you need to request BOTH cookies permission AND host permissions together
        const normalizedDomain = domain.replace(/^www\./, '');

        const granted = await chrome.permissions.request({
            permissions: ['cookies'], // This requests the optional cookie permission
            origins: [
                `*://${domain}/*`,
                `*://*.${domain}/*`,
                `*://${normalizedDomain}/*`,
                `*://*.${normalizedDomain}/*`
            ]
        });

        // console.log('Permission request result:', granted);

        if (granted) {
            // Verify permissions were actually granted
            const hasPermissions = await chrome.permissions.contains({
                permissions: ['cookies'],
                origins: [`*://${normalizedDomain}/*`]
            });

            console.log('Verification - permissions actually granted:', hasPermissions);

            // Test cookie access immediately
            const testCookies = await new Promise((resolve) => {
                chrome.cookies.getAll({}, (cookies) => {
                    if (chrome.runtime.lastError) {
                        console.log('Test cookie access error:', chrome.runtime.lastError.message);
                        resolve([]);
                    } else {
                        console.log('Test cookie access - total cookies found:', cookies ? cookies.length : 0);
                        resolve(cookies || []);
                    }
                });
            });

            cookiesPermissionStatus.set(domain, true);
            setupCookieListener(domain, tabId);

            response({
                success: true,
                granted: true,
                message: `Cookie permission granted. Test found ${testCookies.length} total cookies.`
            });
        } else {
            cookiesPermissionStatus.set(domain, false);
            response({
                success: true,
                granted: false,
                message: 'Cookie permission denied by user'
            });
        }
    } catch (error) {
        console.error('Permission request failed:', error);
        response({
            success: false,
            error: error.message
        });
    }
}


// Permission check function
async function checkCookiePermissions(domain) {
    try {
        const normalizedDomain = domain.replace(/^www\./, '');

        // Check if we have both cookies permission and host permission
        const hasPermissions = await chrome.permissions.contains({
            permissions: ['cookies'],
            origins: [
                `*://${domain}/*`,
                `*://*.${normalizedDomain}/*`
            ]
        });

        console.log(`Permission check for ${domain}:`, hasPermissions);
        return hasPermissions;
    } catch (error) {
        console.error('Permission check failed:', error);
        return false;
    }
}



//GET COOKIES HANDLE---------------------------------------------------------------------------

// PROMISE FOR HANDLE GET COOKIES
function getCookiesForDomain(domain) {
    return new Promise(async (resolve, reject) => {
        try {

            // Normalize domain (remove www. prefix for cookie storage)
            const normalizedDomain = domain.replace(/^www\./, '');
            console.log('Normalized domain:', normalizedDomain);

            let cookies = [];

            // Try dot-prefixed version first (this is how major sites like Google store cookies)
            console.log('Trying .${normalizedDomain}:', `.${normalizedDomain}`);
            cookies = await new Promise((res, rej) => {
                chrome.cookies.getAll({ domain: `.${normalizedDomain}` }, (cookies) => {
                    if (chrome.runtime.lastError) {
                        console.log('Error with dot prefix:', chrome.runtime.lastError.message);
                        rej(new Error(chrome.runtime.lastError.message));
                    } else {
                        console.log(`Found ${cookies.length} cookies for .${normalizedDomain}`);
                        res(cookies || []);
                    }
                });
            });
            

            // If still no cookies, try original domain (www.google.com)
            if (cookies.length === 0) {
                console.log('Trying original domain:', domain);
                cookies = await new Promise((res, rej) => {
                    chrome.cookies.getAll({ domain }, (cookies) => {
                        if (chrome.runtime.lastError) {
                            console.log('Error with original domain:', chrome.runtime.lastError.message);
                            rej(new Error(chrome.runtime.lastError.message));
                        } else {
                            console.log(`Found ${cookies.length} cookies for ${domain}`);
                            res(cookies || []);
                        }
                    });
                });
            }

            // Last resort - get all cookies and filter manually
            if (cookies.length === 0) {
                console.log('No cookies found with direct queries, trying manual filter...');
                const allCookies = await new Promise((res, rej) => {
                    chrome.cookies.getAll({}, (cookies) => {
                        if (chrome.runtime.lastError) {
                            rej(new Error(chrome.runtime.lastError.message));
                        } else {
                            res(cookies || []);
                        }
                    });
                });

                console.log(`Total cookies in browser: ${allCookies.length}`);

                // Filter cookies that match the domain
                cookies = allCookies.filter(cookie => {
                    const cookieDomain = cookie.domain.toLowerCase().replace(/^\./, '');
                    const targetDomain = normalizedDomain.toLowerCase();
                    const originalDomain = domain.toLowerCase().replace(/^\./, '');

                    const matches = (
                        cookieDomain === targetDomain ||
                        cookieDomain === originalDomain ||
                        cookieDomain.endsWith('.' + targetDomain) ||
                        targetDomain.endsWith('.' + cookieDomain) ||
                        // Check if cookie domain matches any part of our target
                        (cookie.domain.startsWith('.') &&
                            (targetDomain.includes(cookieDomain) || cookieDomain.includes(targetDomain)))
                    );

                    if (matches) {
                        console.log(`Matched cookie: ${cookie.name} (${cookie.domain})`);
                    }

                    return matches;
                });

                console.log(`Found ${cookies.length} cookies after manual filtering`);
            }

            console.log('Final cookies found:', cookies.length);
            resolve(cookies);

        } catch (error) {
            console.error('getCookiesForDomain error:', error);
            reject(error);
        }
    });
}


async function handleGetCookies(message, sender, response) {
    try {
        const domain = message.domain;
        console.log('handleGetCookies called with domain:', domain);

        // Check permissions using the improved function
        const hasPermission = await checkCookiePermissions(domain);
        const statusPermission = cookiesPermissionStatus.get(domain);

        console.log('Permission check result:', hasPermission);
        console.log('Status permission:', statusPermission);

        if (!hasPermission && !statusPermission) {
            console.log('No permission found for domain');
            response({
                success: false,
                error: 'No cookie permission for this domain. Please grant permission first.'
            });
            return;
        }

        // Get cookies with improved function
        const cookies = await getCookiesForDomain(domain);
        console.log('Raw cookies retrieved:', cookies.length);

        // Sanitize
        const sanitizedCookies = cookies.map(cookie => ({
            name: cookie.name,
            domain: cookie.domain,
            path: cookie.path,
            value: cookie.value,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
            expirationDate: cookie.expirationDate
        }));

        console.log('Sanitized cookies:', sanitizedCookies.length);

        response({
            success: true,
            cookies: sanitizedCookies,
        });

    } catch (error) {
        console.error('Failed to get cookies:', error);
        response({
            success: false,
            error: error.message
        });
    }
}



//CLEAR COOKIES HANDLE
async function handleClearCookies(message, sender, response) {
    try {
        const domain = message.domain;
        console.log('Requesting cookies for domain:', domain)

        //Checking for permission
        const hasPermission = await chrome.permissions.contains({
            permissions: ['cookies'],
            origins: [`*://${domain}/*`, `*://*.${domain}/*`]
        });

        if (!hasPermission && !cookiesPermissionStatus.get(domain)) {
            response({
                success: false,
                error: 'No cookie permission for this domain'
            });
            return;
        }

        const cookies = await chrome.cookies.getAll({ domain });

        //Remove Cookie
        const results = await Promise.allSettled(
            cookies.map(cookie => {
                const domainForUrl = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
                return chrome.cookies.remove({
                    url: `http${cookie.secure ? 's' : ''}://${domainForUrl}${cookie.path}`, //If cookie is marked secure, meant works over HTTPS so including 's' in the url
                    name: cookie.name
                });
            })
        );

        const successCount = results.filter(r => r.status === "fulfilled").length;
        const failCount = results.length - successCount;

        response({
            success: true,
            message: `Attempted to clear ${results.length} cookies for ${domain}. Success: ${successCount}, Failed: ${failCount}`
        });

    } catch (error) {
        console.error('Failed to clear cookies', error);
        response({
            success: false,
            error: error.message
        });
    }
}

//REVOKE PERMISSION REQUEST HANDLE
async function handleRevokePermission(message, sender, response) {
    try {
        const domain = message.domain;
        const tabId = sender.tab.id;

        //validating domain specifically for this operation as chrome.permissions.remove expects a well formed origins pattern 
        const removed = await chrome.permissions.remove({
            permissions: ['cookies'],
            origins: [`*://${domain}/*`]
        });

        if (removed) {
            //Update internal state
            cookiesPermissionStatus.delete(domain);

            //Removing all listeners for this tab if set
            removeCookieListener(tabId);
        }

        response({
            success: true,
            removed,
            message: removed ? `Permission revoked for ${domain}` : `No permission found for ${domain} to revoke`
        });

    } catch (error) {
        console.error("Failed to revoke permission", error);
        response({
            success: false,
            error: error.message
        });
    }
}

//SET UP FOR COOKIE CHANGE LISTENER FOR REAL TIME UPDATES----------------------------------------------------------------------------
async function setupCookieListener(domain, tabId) {
    console.log(`Setting up cookie listener for tab ${tabId}, domain: ${domain}`);

    //Remove existing listeners(for this tabId) if there
    if (cookieListeners.has(tabId)) {
        const oldListener = cookieListeners.get(tabId).listener;
        if (chrome.cookies.onChanged.hasListener(oldListener)) {
            chrome.cookies.onChanged.removeListener(oldListener);
        }
        console.log(`Removed old listener for tab ${tabId}`);
    }

    //Scoped Listener specific to this tabId
    const listener = async (changeInfo) => {
        try {
            if (!changeInfo.cookie) return;

            const changedDomain = changeInfo.cookie.domain.replace(/^\./, ""); // Normalize
            const normalizedTargetDomain = domain.replace(/^\./, "");

            // Better domain matching logic
            if (!isDomainMatch(changedDomain, normalizedTargetDomain)) {
                return;
            }

            console.log(`Cookie change detected for tab ${tabId}, domain ${domain}:`, changeInfo);

            // Get updated cookies and send to tab
            const cookies = await chrome.cookies.getAll({ domain: normalizedTargetDomain });
            const sanitizedCookies = cookies.map(cookie => ({
                name: cookie.name,
                domain: cookie.domain,
                path: cookie.path,
                value: cookie.value,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
                sameSite: cookie.sameSite,
                expirationDate: cookie.expirationDate
            }));

            // Send message to specific tab
            chrome.tabs.sendMessage(tabId, {
                type: "COOKIES_UPDATED",
                domain: normalizedTargetDomain,
                cookies: sanitizedCookies,
                changeInfo: {
                    cause: changeInfo.cause,
                    removed: changeInfo.removed,
                    cookie: changeInfo.cookie
                }
            }).catch(error => {
                console.log(`Could not send cookie update to tab ${tabId}:`, error);
                // Tab might be closed, remove listener
                removeCookieListener(tabId);
            });

        } catch (error) {
            console.error(`Cookie change handler error for tab ${tabId}:`, error);
        }
    };

    //Add new Listener
    chrome.cookies.onChanged.addListener(listener);

    //Store domain and tabId for listener use
    //Kind of METADATA
    cookieListeners.set(tabId, {
        domain,
        listener,
        timestamp: Date.now()
    });

    console.log(`Active listeners count: ${cookieListeners.size}`);
}


// Helper function for better domain matching
function isDomainMatch(changedDomain, targetDomain) {
    // Exact match
    if (changedDomain === targetDomain) return true;

    // Subdomain match (e.g., api.example.com matches example.com)
    if (changedDomain.endsWith('.' + targetDomain)) return true;

    // Parent domain match (e.g., example.com matches api.example.com)
    if (targetDomain.endsWith('.' + changedDomain)) return true;

    return false;
}

// Function to remove cookie listener for specific tab
function removeCookieListener(tabId) {
    const listenerData = cookieListeners.get(tabId);
    if (listenerData) {
        console.log(`Removing cookie listener for tab ${tabId}`);

        // Remove the specific listener
        if (chrome.cookies.onChanged.hasListener(listenerData.listener)) {
            chrome.cookies.onChanged.removeListener(listenerData.listener);
        }

        // Remove from tracking
        cookieListeners.delete(tabId);

        console.log(`Active listeners count after removal: ${cookieListeners.size}`);
    }
}

// Clean up listeners when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
    console.log(`Tab ${tabId} closed, cleaning up listener`);
    removeCookieListener(tabId);
});

// Clean up listeners when tabs navigate to new URLs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && cookieListeners.has(tabId)) {
        const oldDomain = cookieListeners.get(tabId).domain;
        const newDomain = new URL(changeInfo.url).hostname;

        if (oldDomain !== newDomain) {
            console.log(`Tab ${tabId} navigated from ${oldDomain} to ${newDomain}, cleaning up old listener`);
            removeCookieListener(tabId);
        }
    }
});

// Periodic cleanup of stale listeners (every 5 minutes)
setInterval(() => {
    console.log('Running periodic listener cleanup...');
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [tabId, listenerData] of cookieListeners.entries()) {
        if (now - listenerData.timestamp > staleThreshold) {
            // Check if tab still exists
            chrome.tabs.get(tabId).catch(() => {
                console.log(`Removing stale listener for tab ${tabId}`);
                removeCookieListener(tabId);
            });
        }
    }
}, 5 * 60 * 1000);

// Debug function to show active listeners
function debugActiveListeners() {
    console.log('=== Active Cookie Listeners ===');
    console.log(`Total active listeners: ${cookieListeners.size}`);
    for (const [tabId, data] of cookieListeners.entries()) {
        console.log(`Tab ${tabId}: ${data.domain} (${new Date(data.timestamp).toLocaleTimeString()})`);
    }
    console.log('==============================');
}

// Expose debug function globally (for debugging in console)
globalThis.debugActiveListeners = debugActiveListeners;

















































