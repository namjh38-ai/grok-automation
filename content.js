// Content Script for Grok Automation (v6.0 - Sequential Fix)
// Key insight: Navigation is handled by sidepanel.js via chrome.tabs.update()
// This script only handles: options → upload → prompt → submit → wait → download

console.log('Grok Automation: Content Script v6.0 Loaded');

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForElement(selector, timeout = 10000, interval = 300) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const el = document.querySelector(selector);
        if (el) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
                return el;
            }
        }
        await sleep(interval);
    }
    return null;
}

async function waitForElementAny(selector, timeout = 10000, interval = 300) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const el = document.querySelector(selector);
        if (el) return el;
        await sleep(interval);
    }
    return null;
}

async function simulateClick(element) {
    if (!element) return;
    const events = ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (const eventType of events) {
        element.dispatchEvent(new MouseEvent(eventType, {
            bubbles: true, cancelable: true, composed: true, view: window, detail: 1
        }));
    }
    await sleep(300);
}

function findByText(selector, text) {
    const elements = Array.from(document.querySelectorAll(selector));
    return elements.find(el => {
        const t = (el.textContent || '').trim().toLowerCase();
        return t === text.toLowerCase() || t.includes(text.toLowerCase());
    });
}

function findVisibleButtonByText(text) {
    const candidates = document.querySelectorAll('button, div[role="button"], a[role="button"], a');
    for (const el of candidates) {
        const t = (el.textContent || '').trim();
        const tLower = t.toLowerCase();
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (tLower === text.toLowerCase() || tLower.includes(text.toLowerCase()))) {
            return el;
        }
    }
    return null;
}

function findPromptInput() {
    const editables = document.querySelectorAll('[contenteditable="true"]');
    for (const el of editables) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 20) {
            if (!el.closest('nav, header, [role="banner"]')) return el;
        }
    }
    const textareas = document.querySelectorAll('textarea');
    for (const ta of textareas) {
        const placeholder = (ta.placeholder || '').toLowerCase();
        if (placeholder.includes('search')) continue;
        if (ta.offsetParent !== null) return ta;
    }
    return null;
}

async function waitForPromptInput(timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const input = findPromptInput();
        if (input) return input;
        await sleep(500);
    }
    return null;
}


// ============================================================
// UPLOAD IMAGE
// ============================================================

async function uploadImage(base64Data) {
    console.log('[UPLOAD] Starting image upload...');

    let dataUrl = base64Data;
    if (!dataUrl.includes(',')) {
        dataUrl = 'data:image/jpeg;base64,' + dataUrl;
    }

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const file = new File([blob], `image-${Date.now()}.jpg`, { type: 'image/jpeg' });

    // Find file input - try multiple times with longer waits
    let fileInput = null;

    // Attempt 1: Direct search
    fileInput = document.querySelector('input[type="file"]');

    // Attempt 2: Wait for it
    if (!fileInput) {
        console.log('[UPLOAD] Waiting for file input...');
        fileInput = await waitForElementAny('input[type="file"]', 8000);
    }

    // Attempt 3: Click attach/upload buttons to reveal it
    if (!fileInput) {
        console.log('[UPLOAD] Trying attach buttons...');
        const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        for (const btn of allButtons) {
            const label = (btn.ariaLabel || btn.textContent || '').toLowerCase();
            const hasSvg = btn.querySelector('svg');
            if (label.includes('attach') || label.includes('upload') || label.includes('file') || label.includes('image') || label.includes('photo')) {
                await simulateClick(btn);
                await sleep(1500);
                fileInput = document.querySelector('input[type="file"]');
                if (fileInput) {
                    console.log('[UPLOAD] File input found after clicking:', label);
                    break;
                }
            }
        }
    }

    // Attempt 4: Search all inputs
    if (!fileInput) {
        const inputs = document.querySelectorAll('input');
        for (const inp of inputs) {
            if (inp.type === 'file' || (inp.accept && inp.accept.includes('image'))) {
                fileInput = inp;
                break;
            }
        }
    }

    if (!fileInput) {
        throw new Error('File input not found after all attempts');
    }

    // Record URL before upload
    const urlBefore = window.location.href;

    // Upload file
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    console.log('[UPLOAD] File set, waiting for page transition...');

    // Wait for possible page transition
    const startTime = Date.now();
    let urlChanged = false;
    while (Date.now() - startTime < 10000) {
        if (window.location.href !== urlBefore) {
            urlChanged = true;
            console.log('[UPLOAD] URL changed:', window.location.href);
            break;
        }
        await sleep(300);
    }

    if (urlChanged) {
        // Wait for new page to settle
        await sleep(4000);
        // Wait for prompt input on new page
        await waitForPromptInput(15000);
    } else {
        await sleep(3000);
    }

    console.log('[UPLOAD] Image upload complete ✓');
}


// ============================================================
// CONFIGURE VIDEO OPTIONS (after upload, on new page)
// ============================================================

async function configureVideoOptions(settings) {
    console.log('[OPTIONS] Configuring video options...');
    await sleep(2000);

    if (settings && settings.duration) {
        const durationText = settings.duration.replace('s', '');
        const allClickable = document.querySelectorAll('button, span, div[role="button"], div[role="option"]');
        for (const el of allClickable) {
            const text = (el.textContent || '').trim();
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && (text === settings.duration || text === durationText || text === durationText + 's')) {
                await simulateClick(el);
                console.log('[OPTIONS] Duration set:', text);
                await sleep(500);
                break;
            }
        }
    }

    console.log('[OPTIONS] Done ✓');
}


// ============================================================
// CONFIGURE MODE (for text-to-image)
// ============================================================

async function configureMode(mode, settings) {
    console.log(`[MODE] Configuring: ${mode}`);
    if (mode === 'textToImage') {
        const imageBtn = findByText('button, div[role="button"], span', 'Image')
            || findByText('button, div[role="button"], span', 'Imagine');
        if (imageBtn) {
            await simulateClick(imageBtn);
            await sleep(500);
        }
    }
    if (settings && settings.aspectRatio) {
        const arBtn = findByText('button, div[role="button"], span', settings.aspectRatio);
        if (arBtn) {
            await simulateClick(arBtn);
            await sleep(300);
        }
    }
}


// ============================================================
// FILL PROMPT
// ============================================================

async function fillPrompt(text) {
    console.log('[PROMPT] Filling:', text);
    await sleep(1000);

    const inputEl = await waitForPromptInput(10000);
    if (!inputEl) throw new Error('Prompt input not found');

    inputEl.focus();
    await sleep(300);

    if (inputEl.tagName === 'TEXTAREA') {
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        )?.set;
        if (nativeSetter) nativeSetter.call(inputEl, text);
        else inputEl.value = text;
    } else {
        inputEl.textContent = text;
    }

    inputEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    await sleep(500);
    console.log('[PROMPT] Filled ✓');
}


// ============================================================
// CLICK SUBMIT
// ============================================================

async function clickSubmit(mode) {
    console.log('[SUBMIT] Looking for submit button...');

    // For video: find "동영상 만들기" specifically
    if (mode && mode.includes('Video')) {
        await sleep(1000);
        const makeVideoBtn = findVisibleButtonByText('동영상 만들기')
            || findVisibleButtonByText('만들기')
            || findVisibleButtonByText('Make video')
            || findVisibleButtonByText('Generate video');
        if (makeVideoBtn) {
            console.log('[SUBMIT] Found 동영상 만들기 ✓');
            await simulateClick(makeVideoBtn);
            await sleep(500);
            return true;
        }
    }

    // Generic: find button near prompt input
    const inputEl = findPromptInput();
    if (inputEl) {
        let container = inputEl.parentElement;
        for (let depth = 0; depth < 6 && container; depth++) {
            const buttons = container.querySelectorAll('button');
            for (const btn of buttons) {
                const label = (btn.ariaLabel || btn.textContent || '').toLowerCase().trim();
                if (label.includes('attach') || label.includes('upload') ||
                    label.includes('settings') || label.includes('voice') ||
                    label.includes('search') || label.includes('new')) continue;
                if (label.includes('send') || label.includes('submit') ||
                    label.includes('generate') || label.includes('만들기') ||
                    label.includes('동영상') || btn.querySelector('svg')) {
                    if (!btn.disabled) {
                        await simulateClick(btn);
                        return true;
                    }
                }
            }
            container = container.parentElement;
        }
    }

    const selectors = ['button[aria-label="Send Message"]', 'button[data-testid="send-button"]',
        'button[aria-label="Generate"]', 'button[aria-label="Submit"]'];
    for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled) { await simulateClick(btn); return true; }
    }

    return false;
}


// ============================================================
// WAIT FOR GENERATION
// ============================================================

async function waitForGenerationToComplete(mode) {
    console.log('[WAIT] Waiting for generation...');
    const isVideo = mode && mode.includes('Video');
    await sleep(5000);
    const maxWaitMs = 180000;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
        const spinners = document.querySelectorAll('.animate-spin');
        if (isVideo) {
            const videos = document.querySelectorAll('article video, main video');
            const valid = Array.from(videos).filter(v => v.src && v.src.length > 0);
            if (valid.length > 0 && spinners.length === 0) {
                await sleep(2000);
                return true;
            }
        } else {
            const images = document.querySelectorAll('article img, main img');
            const valid = Array.from(images).filter(img => {
                const src = img.src || '';
                return (src.startsWith('data:image') && src.length > 10000) || src.includes('assets.grok.com');
            });
            if (valid.length > 0 && spinners.length === 0) {
                await sleep(2000);
                return true;
            }
        }
        const svgCircles = document.querySelectorAll('svg circle[stroke-dasharray]');
        if (spinners.length === 0 && svgCircles.length === 0) {
            await sleep(3000);
            if (document.querySelectorAll('.animate-spin').length === 0) return true;
        }
        await sleep(2000);
    }
    return true;
}


// ============================================================
// DOWNLOAD
// ============================================================

async function downloadLatestResult(mode) {
    const isVideo = mode.includes('Video');
    const downloadBtn = findByText('button, a', 'Download');
    if (downloadBtn) { await simulateClick(downloadBtn); await sleep(1000); return; }
    const selector = isVideo ? 'video' : 'img';
    const items = Array.from(document.querySelectorAll(`article ${selector}, main ${selector}`));
    const valid = items.filter(el => isVideo ? (el.src && el.src.length > 0) : (el.naturalWidth > 100 || (el.src && el.src.startsWith('data:image'))));
    if (valid.length > 0) {
        chrome.runtime.sendMessage({
            action: 'download_media',
            url: valid[valid.length - 1].src,
            filename: `grok_${mode}_${Date.now()}.${isVideo ? 'mp4' : 'png'}`
        });
    }
}


// ============================================================
// MAIN PIPELINE
// Note: Page navigation is now handled by sidepanel.js
// This script receives a message AFTER the page has been navigated to a fresh imagine page
// ============================================================

async function processQueueItem(data) {
    console.log('═══════════════════════════════════════');
    console.log('[PROCESS] Starting item:', data.text);
    console.log('═══════════════════════════════════════');

    const { mode, text, image, settings } = data;

    // Wait for page to be fully ready (sidepanel navigated us here)
    console.log('[PROCESS] Waiting for page to be ready...');
    const input = await waitForPromptInput(20000);
    if (!input) throw new Error('Page not ready: prompt input not found');
    console.log('[PROCESS] Page ready ✓');

    if (mode === 'imageToVideo' && image) {
        // ===== Image-to-Video =====
        await uploadImage(image);
        await configureVideoOptions(settings);
        await fillPrompt(text);
        const submitted = await clickSubmit(mode);
        if (!submitted) throw new Error('Failed to click 동영상 만들기');
    } else if (mode === 'textToVideo') {
        await configureMode(mode, settings);
        await configureVideoOptions(settings);
        await fillPrompt(text);
        const submitted = await clickSubmit(mode);
        if (!submitted) throw new Error('Failed to click submit');
    } else {
        await configureMode(mode, settings);
        await fillPrompt(text);
        const submitted = await clickSubmit(mode);
        if (!submitted) throw new Error('Failed to click submit');
    }

    await waitForGenerationToComplete(mode);
    if (settings && settings.autoDownload) await downloadLatestResult(mode);

    console.log('═══════════════════════════════════════');
    console.log('[PROCESS] Item complete ✓');
    console.log('═══════════════════════════════════════');
}


// ============================================================
// MESSAGE LISTENER
// ============================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'process_prompt') {
        processQueueItem(request.data)
            .then(() => sendResponse({ success: true }))
            .catch((err) => {
                console.error('[ERROR]', err);
                sendResponse({ success: false, error: err.message });
            });
        return true;
    }

    // Ping to check if content script is alive
    if (request.action === 'ping') {
        sendResponse({ alive: true });
        return;
    }
});
