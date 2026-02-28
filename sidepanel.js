// Side Panel Logic (v2.0)

// State
let state = {
    queue: [],
    uploadedImages: [], // { file, id, preview, name, dim }
    isRunning: false,
    currentPromptIndex: -1
};

// DOM Elements
const els = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    gallery: document.getElementById('gallery'),
    promptInput: document.getElementById('promptInput'),
    queueList: document.getElementById('queueList'),
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    addToQueueBtn: document.getElementById('addToQueueBtn'),
    modeSelect: document.getElementById('modeSelect'),
    imageCount: document.getElementById('imageCount'),
    queueCount: document.getElementById('queueCount'),
    clearImagesBtn: document.getElementById('clearImagesBtn'),
    sortNameBtn: document.getElementById('sortNameBtn'),
    sortDateBtn: document.getElementById('sortDateBtn'),
    clearQueueBtn: document.getElementById('clearQueueBtn'),

    // Configs
    aspectRatio: document.getElementById('aspectRatio'),
    duration: document.getElementById('duration'),
    delay: document.getElementById('delayInput'),
    autoDownload: document.getElementById('autoDownload'),
    durationGroup: document.getElementById('durationGroup')
};

// --- Initialization ---

function init() {
    setupEventListeners();
    updateUI();
}

function setupEventListeners() {
    // File Upload
    els.dropZone.addEventListener('click', () => els.fileInput.click());
    els.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); els.dropZone.style.borderColor = '#007fd4'; });
    els.dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); els.dropZone.style.borderColor = '#3e3e42'; });
    els.dropZone.addEventListener('drop', handleDrop);
    els.fileInput.addEventListener('change', handleFileSelect);

    // Gallery Actions
    els.clearImagesBtn.addEventListener('click', () => { state.uploadedImages = []; renderGallery(); });
    els.sortNameBtn.addEventListener('click', () => sortImages('name'));
    els.sortDateBtn.addEventListener('click', () => sortImages('date'));

    // Batch Actions
    els.addToQueueBtn.addEventListener('click', addToQueue);
    els.clearQueueBtn.addEventListener('click', () => { state.queue = []; renderQueue(); });

    // Automation Control
    els.startBtn.addEventListener('click', startAutomation);
    els.stopBtn.addEventListener('click', stopAutomation);

    // Config Changes
    els.modeSelect.addEventListener('change', updateConfigVisibility);
}

// --- Image Handling ---

function handleFileSelect(e) {
    processFiles(e.target.files);
    els.fileInput.value = ''; // reset
}

function handleDrop(e) {
    e.preventDefault();
    els.dropZone.style.borderColor = '#3e3e42';
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
}

async function processFiles(files) {
    for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;

        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
            state.uploadedImages.push({
                file: file,
                id: Date.now() + Math.random(),
                preview: e.target.result,
                name: file.name,
                date: file.lastModified
            });
            renderGallery();
        };
        reader.readAsDataURL(file);
    }
}

function renderGallery() {
    els.gallery.innerHTML = '';
    state.uploadedImages.forEach((img, index) => {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.innerHTML = `
            <img src="${img.preview}">
            <div class="remove-btn" onclick="removeImage(${index})">×</div>
            <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); color:white; font-size:9px; padding:2px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${index + 1}. ${img.name}</div>
        `;
        els.gallery.appendChild(div);
    });

    els.imageCount.textContent = state.uploadedImages.length;
    els.dropZone.style.display = state.uploadedImages.length > 0 ? 'none' : 'block';
}

window.removeImage = (index) => {
    state.uploadedImages.splice(index, 1);
    renderGallery();
};

function sortImages(by) {
    if (by === 'name') {
        state.uploadedImages.sort((a, b) => a.name.localeCompare(b.name));
    } else if (by === 'date') {
        state.uploadedImages.sort((a, b) => a.date - b.date);
    }
    renderGallery();
}

// --- Queue Management ---

async function addToQueue() {
    const text = els.promptInput.value.trim();
    const prompts = text ? text.split('\n').filter(p => p.trim()) : [];
    const images = state.uploadedImages;
    const mode = els.modeSelect.value;

    // Validation
    const needsImage = mode === 'imageToVideo';
    if (needsImage && images.length === 0) {
        alert('Image-to-Video mode requires at least one image.');
        return;
    }
    if (prompts.length === 0 && !needsImage) {
        alert('Please enter at least one prompt.');
        return;
    }

    // Determine Batch Count (Max of prompts or images)
    // Logic: 1:1 mapping. 
    // If 5 prompts and 2 images -> P1+I1, P2+I2, P3+I2(loop?), P4+I2... or just P3+null?
    // User requested "Order", implying strict mapping. If images run out, we should probably reuse the last one or error?
    // Let's loop the smaller array to match the larger one, or just stop. 
    // Standard Batch Logic: Iterate up to Prompts count. If no prompts, use Image count (just animate).

    const count = Math.max(prompts.length, images.length);

    for (let i = 0; i < count; i++) {
        // Get Prompt (loop if needed, or empty if Image-only mode allowed)
        let p = prompts.length > 0 ? prompts[i % prompts.length] : "";
        if (!p && needsImage) p = "Animate this image"; // Fallback prompt

        // Get Image (linear, stop if run out?) 
        // User asked for "Order", so strict 1,2,3...
        // If we have 10 prompts and 5 images, usually user wants first 5 with images. 
        // But if they provided text, we assume they want text generated.
        // Let's use % to loop images if fewer than prompts, ensuring every prompt gets an image in Image Mode.
        const imgObj = images.length > 0 ? images[i % images.length] : null;

        let base64 = null;
        if (imgObj) base64 = imgObj.preview; // It's a data URL already

        state.queue.push({
            id: Date.now() + Math.random(),
            text: p,
            image: base64, // Data URL
            mode: mode,
            status: 'pending',
            settings: {
                aspectRatio: els.aspectRatio.value,
                duration: els.duration.value,
                autoDownload: els.autoDownload.checked
            }
        });
    }

    els.promptInput.value = '';
    // Optional: Clear images after adding to queue?
    // state.uploadedImages = []; renderGallery();

    renderQueue();
}

function renderQueue() {
    els.queueList.innerHTML = '';
    state.queue.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = `queue-item ${item.status}`;

        let icon = '📝';
        if (item.mode.includes('Video')) icon = '🎥';
        if (item.image) icon += '🖼️';

        li.innerHTML = `
            <div class="item-content">
                <div class="item-title">${index + 1}. ${item.text || '(No Text)'}</div>
                <div class="item-meta">
                    <span>${icon} ${item.mode}</span>
                    <span>${item.settings.aspectRatio}</span>
                </div>
            </div>
            <div class="status-badge" style="color: ${getStatusColor(item.status)}; font-weight:bold;" title="${item.errorMsg || ''}">
                ${item.status} ${item.errorMsg ? '⚠️' : ''}
            </div>
        `;
        els.queueList.appendChild(li);
    });
    els.queueCount.textContent = state.queue.length;
    updateUI();
}

function getStatusColor(s) {
    if (s === 'completed') return 'var(--success)';
    if (s === 'error') return 'var(--error)';
    if (s === 'running') return 'var(--accent)';
    return 'var(--text-muted)';
}

// --- Automation ---

function startAutomation() {
    if (state.isRunning) return;
    if (state.queue.filter(i => i.status === 'pending').length === 0) return;

    state.isRunning = true;
    updateUI();
    processNext();
}

function stopAutomation() {
    state.isRunning = false;
    updateUI();
}

async function processNext() {
    if (!state.isRunning) return;

    const index = state.queue.findIndex(i => i.status === 'pending');
    if (index === -1) {
        state.isRunning = false;
        updateUI();
        return;
    }

    const item = state.queue[index];
    item.status = 'running';
    renderQueue();

    els.queueList.children[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url.includes('grok.com')) throw new Error("Grok tab not active. Please open Grok.com.");

        // ★ CRITICAL: Navigate to a FRESH imagine page before each item
        // This ensures we start clean (file input available, no old results)
        console.log(`[SIDEPANEL] Navigating to fresh page for item ${index + 1}...`);

        await chrome.tabs.update(tab.id, { url: 'https://grok.com/' });

        // Wait for page to fully load
        await waitForTabLoad(tab.id, 15000);
        console.log('[SIDEPANEL] Page loaded');

        // Wait additional time for SPA to initialize
        await new Promise(r => setTimeout(r, 3000));

        // Inject content script (previous one was destroyed by navigation)
        console.log('[SIDEPANEL] Injecting content script...');
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });
        await new Promise(r => setTimeout(r, 1000));

        // Verify content script is alive
        let alive = false;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const pingRes = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
                if (pingRes && pingRes.alive) {
                    alive = true;
                    console.log('[SIDEPANEL] Content script ready ✓');
                    break;
                }
            } catch (e) {
                console.log(`[SIDEPANEL] Ping attempt ${attempt + 1} failed, retrying...`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (!alive) {
            // One more injection attempt
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            await new Promise(r => setTimeout(r, 2000));
        }

        // Send the actual process message
        console.log('[SIDEPANEL] Sending process_prompt...');
        const res = await chrome.tabs.sendMessage(tab.id, {
            action: 'process_prompt',
            data: item
        });

        if (res && res.success) {
            item.status = 'completed';
        } else {
            throw new Error(res?.error || "Unknown error from content script");
        }

    } catch (e) {
        console.error("Automation Error:", e);
        item.status = 'error';
        item.errorMsg = e.message;
    }

    renderQueue();

    if (state.isRunning) {
        const delay = (parseInt(els.delay.value) || 5) * 1000;
        setTimeout(processNext, delay);
    }
}

/**
 * Wait for a tab to finish loading
 */
function waitForTabLoad(tabId, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        function checkTab() {
            if (Date.now() - startTime > timeout) {
                resolve(); // Proceed anyway after timeout
                return;
            }
            chrome.tabs.get(tabId, (tab) => {
                if (chrome.runtime.lastError) {
                    reject(new Error('Tab not found'));
                    return;
                }
                if (tab.status === 'complete') {
                    resolve();
                } else {
                    setTimeout(checkTab, 500);
                }
            });
        }

        checkTab();
    });
}

function updateUI() {
    els.startBtn.disabled = state.isRunning || state.queue.length === 0;
    els.stopBtn.disabled = !state.isRunning;

    // Style adjustments
    els.startBtn.style.opacity = els.startBtn.disabled ? 0.5 : 1;
}

function updateConfigVisibility() {
    const val = els.modeSelect.value;
    els.durationGroup.classList.toggle('hidden', val === 'textToImage');
}

// Start
init();
