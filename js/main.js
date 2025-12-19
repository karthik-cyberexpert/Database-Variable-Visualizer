/**
 * Workflow Editor - Main Script
 * Merged & Refactored for HTML-based Content
 */

// ==========================================
// 1. STATE & REACTIVITY
// ==========================================

const bus = new EventTarget();

function emit(event, detail) {
    bus.dispatchEvent(new CustomEvent(event, { detail }));
}

function on(event, callback) {
    bus.addEventListener(event, (e) => callback(e.detail));
}

// Initial State (buckets & connections)
let storedState = localStorage.getItem('workflowState');
let loadedData = storedState ? JSON.parse(storedState) : { buckets: [], connections: [] };

const state = {
    buckets: loadedData.buckets || [],
    connections: loadedData.connections || [],
    customTemplates: loadedData.customTemplates || []
};

// Mutation helpers
// History State
let historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

function commitHistory() {
    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }
    
    const snapshot = JSON.parse(JSON.stringify({
        buckets: state.buckets,
        connections: state.connections
    }));
    
    historyStack.push(snapshot);
    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
    } else {
        historyIndex++;
    }
    
    emit('history:updated', { index: historyIndex, total: historyStack.length });
}

setTimeout(() => commitHistory(), 100);

// Mutation helpers
const actions = {
    addBucket(bucket) {
        state.buckets.push(bucket);
        saveState();
        emit('bucket:added', bucket);
        commitHistory();
    },
    updateBucket(id, changes) {
        const b = state.buckets.find(x => x.id === id);
        if (b) {
            Object.assign(b, changes);
            saveState();
            emit('bucket:updated', b);
            commitHistory();
        }
    },
    removeBucket(id) {
        state.buckets = state.buckets.filter(x => x.id !== id);
        
        // Remove from DOM immediately
        const el = document.getElementById(id);
        if (el) el.remove();
        
        reLayout(); 
        saveState();
        emit('bucket:removed', id);
        commitHistory();
    },
    addItemToBucket(bucketId, item) {
        const b = state.buckets.find(x => x.id === bucketId);
        if (b) {
            b.items.push(item);
            saveState();
            emit('bucket:updated', b);
            commitHistory();
        }
    },
    removeItemFromBucket(bucketId, instanceId) {
        const b = state.buckets.find(x => x.id === bucketId);
        if (b) {
            const idx = b.items.findIndex(i => i.instanceId === instanceId);
            if (idx !== -1) {
                b.items.splice(idx, 1);
                saveState();
                emit('bucket:updated', b);
                commitHistory();
            }
        }
    },
    addConnection(conn) {
        state.connections.push(conn);
        saveState();
        emit('connection:added', conn);
        commitHistory();
    },
    removeConnection(id) {
        state.connections = state.connections.filter(c => c.id !== id);
        saveState();
        emit('connection:removed', id);
        commitHistory();
    },
    clearAll() {
        state.buckets = [];
        state.connections = [];
        saveState();
        emit('reset', null);
        commitHistory();
    },
    
    undo() {
        if (historyIndex > 0) {
            historyIndex--;
            const snapshot = historyStack[historyIndex];
            state.buckets = JSON.parse(JSON.stringify(snapshot.buckets));
            state.connections = JSON.parse(JSON.stringify(snapshot.connections));
            
            saveState();
            emit('reset', null);
            emit('history:updated', { index: historyIndex, total: historyStack.length });
        }
    },
    redo() {
         if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            const snapshot = historyStack[historyIndex];
            state.buckets = JSON.parse(JSON.stringify(snapshot.buckets));
            state.connections = JSON.parse(JSON.stringify(snapshot.connections));
            
            saveState();
            emit('reset', null);
            emit('history:updated', { index: historyIndex, total: historyStack.length });
        }
    }
};

function reLayout() {
    const BUCKET_WIDTH = 180; 
    const BUCKET_HEIGHT = 300; 
    const GAP_X = 50;
    const GAP_Y = 20; // Reduced from 50
    const START_X = 50;
    const START_Y = 50;
    
    const containerWidth = document.getElementById('canvas').clientWidth || window.innerWidth;
    const availableWidth = containerWidth - START_X;
    const cols = Math.max(1, Math.floor(availableWidth / (BUCKET_WIDTH + GAP_X)));

    state.buckets.forEach((bucket, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        
        const newX = START_X + col * (BUCKET_WIDTH + GAP_X);
        const newY = START_Y + row * (BUCKET_HEIGHT + GAP_Y);
        
        // Update model
        bucket.x = newX;
        bucket.y = newY;
        
        // Update View immediately for smoothness
        const el = document.getElementById(bucket.id);
        if (el) {
            el.style.left = newX + 'px';
            el.style.top = newY + 'px';
        }
        
        // Rename logic: if we want to strictly rename them to "Bucket 1", "Bucket 2" etc
        // we can do it here, but it might be annoying if user customized names.
        // For now, minimizing side effects, just position.
    });
    
    // Update connections since positions changed
    updateConnections();
}

function saveState() {
    const serializableConnections = state.connections.map(c => ({
        id: c.id,
        sourceId: c.sourceId, 
        targetId: c.targetId,
        points: c.points // Preserve points
    }));

    const toSave = {
        buckets: state.buckets,
        connections: serializableConnections,
        customTemplates: state.customTemplates || []
    };
    
    localStorage.setItem('workflowState', JSON.stringify(toSave));
}

// ==========================================
// 2. CONNECTIONS
// ==========================================

let svgLayer;
let activePath = null;
let startNode = null; 

function initConnections() {
    svgLayer = document.getElementById('connection-layer');

    document.addEventListener('mousedown', (e) => {
        const variableEl = e.target.closest('.variable');
        if (variableEl) {
            startConnection(variableEl, e);
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (activePath && startNode) {
            updateActivePath(e.clientX, e.clientY);
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (activePath) {
            const targetEl = e.target.closest('.variable');
            if (targetEl && targetEl !== startNode) {
                completeConnection(startNode, targetEl);
            } else {
                activePath.remove();
            }
            activePath = null;
            startNode = null;
            
            document.querySelectorAll('.variable.highlight').forEach(el => el.classList.remove('highlight'));
        }
    });

    svgLayer.addEventListener('click', (e) => {
        if (e.target.classList.contains('connection-path')) {
             document.querySelectorAll('.connection-path.selected').forEach(p => p.classList.remove('selected'));
             e.target.classList.add('selected');
             e.stopPropagation();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            const selected = svgLayer.querySelector('.connection-path.selected');
            if (selected) {
                const connId = parseInt(selected.id.replace('conn-', ''));
                actions.removeConnection(connId);
                selected.remove();
            }
        }
    });
    
    document.addEventListener('click', (e) => {
         if (!e.target.closest('.connection-path')) {
             document.querySelectorAll('.connection-path.selected').forEach(p => p.classList.remove('selected'));
         }
    });

    setTimeout(() => {
        state.connections.forEach(conn => renderConnection(conn));
    }, 0);
}

function startConnection(node, e) {
    if (e.button !== 0) return; 
    e.preventDefault(); 
    startNode = node;
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('connection-path', 'preview');
    svgLayer.appendChild(path);
    activePath = path;

    updateActivePath(e.clientX, e.clientY);
}

function updateActivePath(mouseX, mouseY) {
    const startRect = startNode.querySelector('.connector-dot').getBoundingClientRect();
    const svgRect = svgLayer.getBoundingClientRect();

    const x1 = startRect.left + startRect.width / 2 - svgRect.left;
    const y1 = startRect.top + startRect.height / 2 - svgRect.top;
    const x2 = mouseX - svgRect.left;
    const y2 = mouseY - svgRect.top;

    const d = getBezierPath(x1, y1, x2, y2);
    activePath.setAttribute('d', d);
}

function completeConnection(sourceEl, targetEl) {
    const sourceId = sourceEl.dataset.connectionId;
    const targetId = targetEl.dataset.connectionId;

    if (!sourceId || !targetId) {
        console.error("Missing connection IDs");
        return;
    }

    const connection = {
        id: Date.now(),
        sourceId, 
        targetId
    };
    
    actions.addConnection(connection);
    renderConnection(connection);
}

function renderConnection(conn) {
    const sourceEl = document.querySelector(`[data-connection-id="${conn.sourceId}"]`);
    const targetEl = document.querySelector(`[data-connection-id="${conn.targetId}"]`);
    
    if (!sourceEl || !targetEl) {
        return;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('connection-path');
    path.id = 'conn-' + conn.id;
    svgLayer.appendChild(path);
    
    updateConnectionPath(conn, path, sourceEl, targetEl);
}

function updateConnectionPath(conn, pathEl, sourceEl, targetEl) {
    if (!sourceEl) sourceEl = document.querySelector(`[data-connection-id="${conn.sourceId}"]`);
    if (!targetEl) targetEl = document.querySelector(`[data-connection-id="${conn.targetId}"]`);
    if (!pathEl) pathEl = document.getElementById('conn-' + conn.id);
    
    if (!pathEl || !sourceEl || !targetEl) return;

    try {
        const r1 = sourceEl.querySelector('.connector-dot').getBoundingClientRect();
        const r2 = targetEl.querySelector('.connector-dot').getBoundingClientRect();
        const svgRect = svgLayer.getBoundingClientRect();
    
        const x1 = r1.left + r1.width / 2 - svgRect.left;
        const y1 = r1.top + r1.height / 2 - svgRect.top;
        const x2 = r2.left + r2.width / 2 - svgRect.left;
        const y2 = r2.top + r2.height / 2 - svgRect.top;
    
        const d = getBezierPath(x1, y1, x2, y2);
        pathEl.setAttribute('d', d);
    } catch (e) {
    }
}

function updateConnections() {
    state.connections.forEach(conn => {
        updateConnectionPath(conn);
    });
}

function getBezierPath(x1, y1, x2, y2) {
    const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const cpOffset = Math.max(50, Math.min(200, dist / 2));
    return `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`;
}

// ==========================================
// 3. CANVAS
// ==========================================

let canvas;
let bucketsContainer;
let currentDragOffset = { x: 0, y: 0 };
let activeDragBucketId = null;

function initCanvas() {
    canvas = document.getElementById('canvas');
    bucketsContainer = document.getElementById('buckets-container');

    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    canvas.addEventListener('drop', handleCanvasDrop);

    document.getElementById('create-bucket-btn').addEventListener('click', () => {
        createBucket(null, 
            canvas.getBoundingClientRect().width / 2 + canvas.getBoundingClientRect().left,
            canvas.getBoundingClientRect().height / 2 + canvas.getBoundingClientRect().top
        );
    });

    const globalExportBtn = document.getElementById('global-export-btn');
    if (globalExportBtn) {
        globalExportBtn.addEventListener('click', handleGlobalExport);
    }

    document.addEventListener('mousemove', handleBucketDragMove);
    document.addEventListener('mouseup', handleBucketDragEnd);

    // Listen for History Reset (Undo/Redo)
    on('reset', () => {
        if (typeof currentOpenBucketId !== 'undefined' && currentOpenBucketId) {
             const bucket = state.buckets.find(b => b.id === currentOpenBucketId);
             if (bucket) {
                 openBucketDetail(currentOpenBucketId);
             } else {
                 closeBucketDetail();
                 renderBuckets();
                 updateConnections();
             }
        } else {
            renderBuckets();
            updateConnections();
        }
    });

    state.buckets.forEach(bucket => renderBucket(bucket));
}

function handleCanvasDrop(e) {
    e.preventDefault();
    const json = e.dataTransfer.getData('application/json');
    if (!json) return;

    try {
        const data = JSON.parse(json);
        if (data.type === 'sidebar-item') {
            if (e.target.closest('.bucket')) return; 
            createBucket(data, e.clientX, e.clientY);
        }
    } catch (err) {
        console.error('Invalid drop data', err);
    }
}

function createBucket(itemData, clientX, clientY) {
    // 1. Auto-Naming
    const nextIndex = state.buckets.length + 1;
    const label = `Bucket ${nextIndex}`;

    // 2. Grid Layout Calculation
    const BUCKET_WIDTH = 180; 
    const BUCKET_HEIGHT = 300; // Estimated height 
    const GAP_X = 50;
    const GAP_Y = 50; // Reduced from 50
    const START_X = 50;
    const START_Y = 50;
    
    const containerWidth = canvas.clientWidth || window.innerWidth;
    const availableWidth = containerWidth - START_X;
    const cols = Math.max(1, Math.floor(availableWidth / (BUCKET_WIDTH + GAP_X)));
    
    const currentIndex = state.buckets.length;
    const row = Math.floor(currentIndex / cols);
    const col = currentIndex % cols;
    
    const x = START_X + col * (BUCKET_WIDTH + GAP_X);
    const y = START_Y + row * (BUCKET_HEIGHT + GAP_Y);

    const bucketId = 'bucket-' + Date.now();
    
    const items = itemData ? [{ ...itemData, instanceId: 'item-' + Date.now() }] : [];
    
    const bucket = {
        id: bucketId,
        x,
        y,
        items,
        label: label 
    };
    actions.addBucket(bucket);
    renderBucket(bucket);
}

// ==========================================
// 5. MAIN INIT
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
    initConnections();
    initCanvas();
    initSidebar();
    // syncSidebarVisibility(); // Removed per user request (Copy mode)
    initDetailOverlay();
});

let activeDragCardId = null;
let currentCardDragOffset = { x: 0, y: 0 };
let currentOpenBucketId = null;

function initDetailOverlay() {
    document.getElementById('close-detail-btn').addEventListener('click', closeBucketDetail);
    
    // Card Drag Listeners
    const container = document.getElementById('detail-cards-container');
    container.addEventListener('mousedown', handleCardDragStart);
    document.addEventListener('mousemove', handleCardDragMove);
    document.addEventListener('mouseup', handleCardDragEnd);

    // Export Listener
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', handleExportData);
    }
}

// --- Export Functions ---

// --- Export Functions ---

function handleGlobalExport() {
    try {
        const fullExport = [];

        state.buckets.forEach(bucket => {
            const bucketName = bucket.label || bucket.id;
            const bucketPrefix = bucket.id + ':';
            
            // 1. Matched Data (Internal Connections)
            const relevantConns = state.connections.filter(c => 
                c.sourceId.startsWith(bucketPrefix) && c.targetId.startsWith(bucketPrefix)
            );
            
            const matchedStrings = relevantConns.map(conn => {
                const sourceMeta = resolveConnId(conn.sourceId, bucket);
                const targetMeta = resolveConnId(conn.targetId, bucket);
                return `${sourceMeta.varLabel} (${sourceMeta.appName}) -> ${targetMeta.varLabel} (${targetMeta.appName})`;
            });

            // 2. Unmatched Data
            const unmatchedStrings = [];
            const connectedVarIds = new Set();
            relevantConns.forEach(c => {
                connectedVarIds.add(c.sourceId);
                connectedVarIds.add(c.targetId);
            });

            bucket.items.forEach(item => {
                if (item.variables) {
                    item.variables.forEach(v => {
                        const connId = `${bucket.id}:${item.instanceId}:${v.id}`;
                        if (!connectedVarIds.has(connId)) {
                            unmatchedStrings.push(`${v.label} (${item.label})`);
                        }
                    });
                }
            });

            const bucketObj = {};
            bucketObj[bucketName] = [
                 { "Matched datas": matchedStrings },
                 { "Un Matched Data": unmatchedStrings }
            ];
            
            fullExport.push(bucketObj);
        });

        const content = JSON.stringify(fullExport, null, 2);
        downloadTextFile('global_workflow_export.json', content, 'application/json');

    } catch (e) {
        console.error("Global Export Error:", e);
        alert("Export failed: " + e.message);
    }
}

function handleExportData(formatOverride) {
    try {
        if (!currentOpenBucketId) {
            alert("No bucket is currently open.");
            return;
        }
        const bucket = state.buckets.find(b => b.id === currentOpenBucketId);
        if (!bucket) {
            alert("Error: Bucket not found.");
            return;
        }

        // Use argument if string, otherwise default to json
        const format = (typeof formatOverride === 'string') ? formatOverride : 'json';
        
        // 1. Matched Data
        
        // 1. Matched Data
        const bucketPrefix = bucket.id + ':';
        const relevantConns = state.connections.filter(c => 
            c.sourceId.startsWith(bucketPrefix) && c.targetId.startsWith(bucketPrefix)
        );
        
        const matchedStrings = relevantConns.map(conn => {
            const sourceMeta = resolveConnId(conn.sourceId, bucket);
            const targetMeta = resolveConnId(conn.targetId, bucket);
            return `${sourceMeta.varLabel} (${sourceMeta.appName}) -> ${targetMeta.varLabel} (${targetMeta.appName})`;
        });

        // 2. Unmatched Data
        const unmatchedStrings = [];
        const connectedVarIds = new Set();
        relevantConns.forEach(c => {
            connectedVarIds.add(c.sourceId);
            connectedVarIds.add(c.targetId);
        });

        bucket.items.forEach(item => {
            if (item.variables) {
                item.variables.forEach(v => {
                    const connId = `${bucket.id}:${item.instanceId}:${v.id}`;
                    if (!connectedVarIds.has(connId)) {
                        unmatchedStrings.push(`${v.label} (${item.label})`);
                    }
                });
            }
        });
        
        let content = '';
        let mimeType = '';
        let ext = '';
        
        if (format === 'csv') {
            const header = "Matched Data,Unmatched Data";
            const maxLen = Math.max(matchedStrings.length, unmatchedStrings.length);
            const rows = [];
            for (let i = 0; i < maxLen; i++) {
                const m = matchedStrings[i] ? `"${matchedStrings[i]}"` : "";
                const u = unmatchedStrings[i] ? `"${unmatchedStrings[i]}"` : "";
                rows.push(`${m},${u}`);
            }
            content = header + '\n' + rows.join('\n');
            mimeType = 'text/csv';
            ext = 'csv';
        } else {
            // User requested structure: Array of objects
            const jsonStructure = [
                { "Matched datas": matchedStrings },
                { "Un Matched Data": unmatchedStrings }
            ];
            content = JSON.stringify(jsonStructure, null, 2);
            mimeType = 'application/json';
            ext = 'json';
        }
        
        downloadTextFile(`${bucket.label || 'bucket'}_export.${ext}`, content, mimeType);

    } catch (e) {
        console.error("Export Error:", e);
        alert("An error occurred during export: " + e.message);
    }
}

function resolveConnId(connId, bucket) {
    const parts = connId.split(':');
    // bucketId:instanceId:varId
    const instanceId = parts[1];
    const varId = parts[2];
    
    const item = bucket.items.find(i => i.instanceId === instanceId);
    if (!item) return { appName: 'Unknown', varLabel: 'Unknown' };
    
    const v = item.variables.find(v => v.id === varId);
    return {
        appName: item.label,
        varLabel: v ? v.label : 'Unknown'
    };
}

function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function openBucketDetail(bucketId) {
    const bucket = state.buckets.find(b => b.id === bucketId);
    if (!bucket) return;
    
    currentOpenBucketId = bucketId;

    currentOpenBucketId = bucketId;

    // --- NEW EXPORT DROPDOWN LOGIC ---
    const triggerBtn = document.getElementById('export-trigger-btn');
    const panel = document.getElementById('export-panel');
    const options = document.querySelectorAll('.export-option');
    
    // Toggle Panel
    if (triggerBtn && panel) {
        // Remove old listeners (cloning is a quick hack to clear listeners)
        const newTrigger = triggerBtn.cloneNode(true);
        triggerBtn.parentNode.replaceChild(newTrigger, triggerBtn);
        
        newTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('hidden');
        });
        
        // Hide on outside click
        document.addEventListener('click', (e) => {
            if (!newTrigger.contains(e.target) && !panel.contains(e.target)) {
                panel.classList.add('hidden');
            }
        });
    }

    // Option Click
    options.forEach(opt => {
        // Clone to clear old
        const newOpt = opt.cloneNode(true);
        opt.parentNode.replaceChild(newOpt, opt);
        
        newOpt.addEventListener('click', (e) => {
            e.stopPropagation();
            const format = newOpt.dataset.format; // 'json' or 'csv'
            handleExportData(format); // Pass format directly
            if (panel) panel.classList.add('hidden');
        });
    });

    // Re-bind Run Button (if it needs any specific context logic update, 
    // but initRunSimulation handles the listener globally on DOMContentLoaded usually.
    // However, if we replace the button element (we didn't, just updated ID/Class in HTML), the global listener holds.
    // WAIT: initRunSimulation looks for 'detail-run-btn'. We kept that ID. So it works.
    
    /*
    // Force re-bind export handler -> REMOVED OLD LOGIC
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.onclick = handleExportData;
    }
    */

    const overlay = document.getElementById('bucket-detail-overlay');
    const labelEl = document.getElementById('detail-bucket-label');
    const container = document.getElementById('detail-cards-container');

    labelEl.innerText = bucket.label || 'Unnamed Bucket';
    container.innerHTML = '';
    
    // Create Board Wrapper
    const wrapper = document.createElement('div');
    wrapper.id = 'detail-board-wrapper';
    wrapper.style.transformOrigin = '0 0';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    container.appendChild(wrapper);

    // Reset Transform
    currentTransform = { x: 0, y: 0, scale: 1 };
    updateContainerTransform();

    // Assign default positions if missing (Grid auto-layout for initial view)
    let needsSave = false;
    bucket.items.forEach((item, index) => {
        if (item.x === undefined || item.y === undefined) {
             // Default Grid
             const col = index % 3;
             const row = Math.floor(index / 3);
             item.x = 100 + col * 350;
             item.y = 100 + row * 300;
             needsSave = true;
        }
    });
    
    if (needsSave) {
        actions.updateBucket(bucket.id, { items: bucket.items });
    }

    // 1. Add SVG Layer specific to this Detail View
    const svgId = 'detail-connection-layer';
    let svgLayer = document.getElementById(svgId);
    if (svgLayer) svgLayer.remove();
    
    svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgLayer.id = svgId;
    wrapper.appendChild(svgLayer); 

    // Render each item as a Card
    bucket.items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'detail-card';
        card.id = 'card-' + item.instanceId;
        card.style.left = item.x + 'px';
        card.style.top = item.y + 'px';

        // Header
        const typeLabel = item.nodeType === 'hub' ? 'HUB' : 'WEB APP';
        
        let html = `
            <div class="detail-card-header" style="position: relative;">
                <span class="type-tag">${typeLabel}</span>
                <span class="delete-card-btn" title="Remove Card" style="position:absolute; top:16px; right:20px; cursor:pointer; color:#94a3b8; font-size:20px; line-height:1;">×</span>
                <span>${item.label}</span>
            </div>
            <div class="detail-card-body">
        `;
        
        // Variables List
        if (item.variables && item.variables.length > 0) {
            item.variables.forEach(v => {
                const connId = `${bucket.id}:${item.instanceId}:${v.id}`;
                html += `
                    <div class="card-variable-row" data-conn-id="${connId}">
                        <span>${v.label}</span>
                        <div class="card-connector" data-conn-id="${connId}"></div>
                    </div>
                `;
            });
        } else {
             html += `<div class="card-variable-row" style="color:#999; font-style:italic;">No variables</div>`;
        }
        
        html += `</div>`;
        card.innerHTML = html;

        // Attach Delete Listener
        const delBtn = card.querySelector('.delete-card-btn');
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('Are you sure you want to remove this card?')) {
                    // Remove connections
                    const bucketPrefix = bucket.id + ':';
                    const newConns = state.connections.filter(c => {
                        const s = c.sourceId.includes(`:${item.instanceId}:`);
                        const t = c.targetId.includes(`:${item.instanceId}:`);
                        return !(s || t);
                    });
                    state.connections = newConns; // simplistic state update, ideally via action
                    
                    // Remove Item
                    const newItems = bucket.items.filter(i => i.instanceId !== item.instanceId);
                    actions.updateBucket(bucket.id, { items: newItems });
                    
                    openBucketDetail(bucket.id); // Re-render
                }
            });
        }

        wrapper.appendChild(card);
    });

    overlay.classList.remove('hidden');

    // Initial Render of Connections in this bucket
    renderDetailConnections(bucket.id);
}

// Global drawing state for Detail View
let detailActivePath = null;
let detailStartNode = null;
// Infinite Board State

// Infinite Board State
let currentTransform = { x: 0, y: 0, scale: 1 };
let isPanning = false;
let panStart = { x: 0, y: 0 };

function initDetailOverlay() {
    const closeBtn = document.getElementById('close-detail-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeBucketDetail);
    
    // Tools: Undo/Redo
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    
    if (undoBtn) {
        undoBtn.addEventListener('click', () => actions.undo());
        undoBtn.disabled = true; // Initial Disabled
    }
    if (redoBtn) {
        redoBtn.addEventListener('click', () => actions.redo());
        redoBtn.disabled = true; // Initial Disabled
    }

    // Listen for History Updates to update UI
    on('history:updated', ({ index, total }) => {
        if (undoBtn) undoBtn.disabled = index <= 0;
        if (redoBtn) redoBtn.disabled = index >= total - 1;
    });

    const container = document.getElementById('detail-cards-container');
    
    // Zoom Slider Logic
    const zoomSlider = document.getElementById('zoom-slider');
    if (zoomSlider) {
        // Sync Slider -> Board
        zoomSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            currentTransform.scale = val;
            updateContainerTransform();
        });
    }

    // Zoom (Wheel) - Update Slider too
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const direction = e.deltaY > 0 ? -1 : 1;
        const newScale = Math.min(Math.max(0.2, currentTransform.scale + direction * zoomIntensity), 3);
        currentTransform.scale = newScale;
        updateContainerTransform();
        
        if (zoomSlider) {
            zoomSlider.value = newScale;
        }
    });

    // 1. Mousedown Handler (Master Switch)
    container.addEventListener('mousedown', (e) => {
        // A. Check for Connection Start (Click on Connector)
        if (e.target.classList.contains('card-connector')) {
            handleDetailConnectionStart(e);
            return;
        }

        // B. Check for Card Drag (Click on Header or Body, excluding connector)
        const card = e.target.closest('.detail-card');
        if (card) {
            handleCardDragStart(e);
            return;
        }

        // C. Background Pan
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        container.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (isPanning) {
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            currentTransform.x += dx;
            currentTransform.y += dy;
            panStart = { x: e.clientX, y: e.clientY };
            updateContainerTransform();
        } else {
            handleCardDragMove(e);
            handleDetailConnectionMove(e);
        }
    });
    
    document.addEventListener('mouseup', (e) => {
        if (isPanning) {
            isPanning = false;
            const container = document.getElementById('detail-cards-container');
            container.style.cursor = ''; 
        }
        handleCardDragEnd(e);
        handleDetailConnectionEnd(e);
    });
}

function updateContainerTransform() {
    let wrapper = document.getElementById('detail-board-wrapper');
    if (!wrapper) return;
    wrapper.style.transform = `translate(${currentTransform.x}px, ${currentTransform.y}px) scale(${currentTransform.scale})`;
}


// --- Detail Connection Logic (Freehand) ---
let currentPathPoints = [];

function handleDetailConnectionStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // Start from Variable Row
    const row = e.target.closest('.card-variable-row');
    if (!row) return;

    detailStartNode = row;
    currentPathPoints = [];
    
    const svgLayer = document.getElementById('detail-connection-layer');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('detail-connection-path', 'preview');
    svgLayer.appendChild(path);
    detailActivePath = path;
    
    // Initial Point
    const pt = getTransformedPoint(e.clientX, e.clientY);
    currentPathPoints.push(pt);
}

function handleDetailConnectionMove(e) {
    if (detailActivePath) {
        const pt = getTransformedPoint(e.clientX, e.clientY);
        currentPathPoints.push(pt);
        
        detailActivePath.setAttribute('d', pointsToPath(currentPathPoints));
    }
}

function handleDetailConnectionEnd(e) {
    if (detailActivePath) {
        detailActivePath.style.pointerEvents = 'none';
        const el = document.elementFromPoint(e.clientX, e.clientY);
        detailActivePath.style.pointerEvents = '';
        
        const targetRow = el ? el.closest('.card-variable-row') : null;
        
        if (targetRow && targetRow !== detailStartNode) {
            const sourceId = detailStartNode.dataset.connId;
            const targetId = targetRow.dataset.connId;
            
            actions.addConnection({
                id: Date.now(),
                sourceId,
                targetId,
                points: [...currentPathPoints]
            });

            renderDetailConnections(currentOpenBucketId);
        }
        
        detailActivePath.remove();
        detailActivePath = null;
        detailStartNode = null;
        currentPathPoints = [];
    }
}

function getTransformedPoint(clientX, clientY) {
    const container = document.getElementById('detail-cards-container');
    const rect = container.getBoundingClientRect();
    
    const x = (clientX - rect.left - currentTransform.x) / currentTransform.scale;
    const y = (clientY - rect.top - currentTransform.y) / currentTransform.scale;
    return { x, y };
}

function getCurvedPath(x1, y1, x2, y2) {
    // Smooth S-Curve
    const dx = Math.abs(x2 - x1);
    
    // Curvature Factor: Dynamic based on distance, minimum 50px
    const cpDist = Math.max(50, dx * 0.5);
    
    const c1x = x1 + cpDist;
    const c1y = y1;
    const c2x = x2 - cpDist;
    const c2y = y2;
    
    return `M ${x1} ${y1} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
}

function renderDetailConnections(bucketId) {
    const svgLayer = document.getElementById('detail-connection-layer');
    if (!svgLayer) return;
    
    svgLayer.innerHTML = '';
    
    const bucketPrefix = bucketId + ':';
    const relevantConns = state.connections.filter(c => 
        c.sourceId.startsWith(bucketPrefix) && c.targetId.startsWith(bucketPrefix)
    );
    
    relevantConns.forEach((conn, index) => {
        if (conn.points && conn.points.length > 0) {
            // 1. VISIBLE PATH (Visuals only, no interaction)
            const visiblePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            visiblePath.classList.add('detail-connection-path');
            visiblePath.setAttribute('d', pointsToPath(conn.points));
            const hue = (index * 137.508) % 360;
            visiblePath.style.stroke = `hsl(${hue}, 70%, 50%)`;
            visiblePath.style.pointerEvents = 'none'; // Pass through
            
            // 2. HIT PATH (Invisible, handles interaction)
            const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            hitPath.setAttribute('d', pointsToPath(conn.points));
            hitPath.classList.add('detail-conn-line-hit');
            hitPath.style.fill = 'none';
            // Use 0.01 alpha to ensure browser hit-testing sees it
            hitPath.style.stroke = 'rgba(255, 0, 0, 0.01)'; 
            hitPath.style.strokeWidth = '25px'; 
            hitPath.style.cursor = 'pointer';
            hitPath.style.pointerEvents = 'all'; // Force capture
            
            // Critical: Stop propagation AND Prevent Default (stops text selection)
            hitPath.addEventListener('mousedown', (e) => {
                 e.preventDefault(); 
                 e.stopPropagation();
            });

            hitPath.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Add a small timeout
                setTimeout(() => {
                    if (confirm('Disband this connection?')) {
                        actions.removeConnection(conn.id);
                        renderDetailConnections(bucketId);
                    }
                }, 10);
            });
            
            svgLayer.appendChild(visiblePath);
            svgLayer.appendChild(hitPath);
        }
        
        const sourceEl = document.querySelector(`.card-variable-row[data-conn-id="${conn.sourceId}"]`);
        const targetEl = document.querySelector(`.card-variable-row[data-conn-id="${conn.targetId}"]`);
        if (sourceEl) sourceEl.classList.add('connected');
        if (targetEl) targetEl.classList.add('connected');
    });
}

function updateDetailLines() {
    // No dynamic update for freehand lines
}

function handleDetailConnectionEnd(e) {
    if (detailActivePath) {
        const targetConnector = e.target.closest('.card-connector');
        
        if (targetConnector && targetConnector !== detailStartNode) {
            const sourceId = detailStartNode.dataset.connId;
            const targetId = targetConnector.dataset.connId;
            
            actions.addConnection({
                id: Date.now(),
                sourceId,
                targetId
            });

            renderDetailConnections(currentOpenBucketId);
        }
        
        detailActivePath.remove();
        detailActivePath = null;
        detailStartNode = null;
    }
}

function getTransformedPoint(clientX, clientY) {
    // Convert screen coordinate to Board Workspace coordinate
    const container = document.getElementById('detail-cards-container');
    const rect = container.getBoundingClientRect();
    
    const x = (clientX - rect.left - currentTransform.x) / currentTransform.scale;
    const y = (clientY - rect.top - currentTransform.y) / currentTransform.scale;
    return { x, y };
}

function updateDetailActivePath(mouseX, mouseY) {
    // Current Mouse in Board Coords
    const mPos = getTransformedPoint(mouseX, mouseY);
    
    // Start Node Center in Board Coords?
    // The nodes are inside the transformed wrapper.
    // So distinct getBoundingClientRect will be affected by transform.
    // We need to un-project it? 
    // OR: Be simpler. The SVG is ALSO inside the wrapper.
    // If SVG is inside wrapper, then coordinate system there is also transformed.
    // So we just need coords relative to the wrapper 0,0.
    
    // Let's check init: `svgLayer` is in `container`. I will move it to `wrapper`.
    
    const wrapper = document.getElementById('detail-board-wrapper');
    if (!wrapper) return;
    
    // Start Node center relative to Wrapper
    const startRect = detailStartNode.getBoundingClientRect(); // Screen Coords
    const wrapperRect = wrapper.getBoundingClientRect(); // Screen Coords
    
    // Rel to Wrapper (which is the SVG space)
    const x1 = (startRect.left - wrapperRect.left + startRect.width/2) / currentTransform.scale;
    const y1 = (startRect.top - wrapperRect.top + startRect.height/2) / currentTransform.scale;
    
    const x2 = (mouseX - wrapperRect.left) / currentTransform.scale;
    const y2 = (mouseY - wrapperRect.top) / currentTransform.scale;
    
    const d = getBezierPath(x1, y1, x2, y2);
    detailActivePath.setAttribute('d', d);
}

function renderDetailConnections(bucketId) {
    const svgLayer = document.getElementById('detail-connection-layer');
    if (!svgLayer) return;
    
    svgLayer.innerHTML = '';
    
    const bucketPrefix = bucketId + ':';
    const relevantConns = state.connections.filter(c => 
        c.sourceId.startsWith(bucketPrefix) && c.targetId.startsWith(bucketPrefix)
    );
    
    relevantConns.forEach((conn, index) => {
        const sourceEl = document.querySelector(`.card-connector[data-conn-id="${conn.sourceId}"]`);
        const targetEl = document.querySelector(`.card-connector[data-conn-id="${conn.targetId}"]`);
        
        if (sourceEl && targetEl) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.classList.add('detail-connection-path');
            path.dataset.id = conn.id;
            
            const hue = (index * 137.508) % 360;
            path.style.stroke = `hsl(${hue}, 70%, 50%)`;
            
            svgLayer.appendChild(path);
            updateDetailConnectionPath(path, sourceEl, targetEl);
            
            sourceEl.classList.add('connected');
            targetEl.classList.add('connected');
        }
    });
}

function updateDetailConnectionPath(pathEl, sourceEl, targetEl) {
    const wrapper = document.getElementById('detail-board-wrapper');
    const wrapperRect = wrapper.getBoundingClientRect();

    const r1 = sourceEl.getBoundingClientRect();
    const r2 = targetEl.getBoundingClientRect();
    
    const x1 = (r1.left - wrapperRect.left + r1.width/2) / currentTransform.scale;
    const y1 = (r1.top - wrapperRect.top + r1.height/2) / currentTransform.scale;
    const x2 = (r2.left - wrapperRect.left + r2.width/2) / currentTransform.scale;
    const y2 = (r2.top - wrapperRect.top + r2.height/2) / currentTransform.scale;

    pathEl.setAttribute('d', getBezierPath(x1, y1, x2, y2));
}

function updateDetailLines() {
    if (!currentOpenBucketId) return;
    const svgLayer = document.getElementById('detail-connection-layer');
    if (!svgLayer) return;
    
    Array.from(svgLayer.children).forEach(path => {
         if (path.classList.contains('preview')) return; 
         
         const connId = parseInt(path.dataset.id);
         const conn = state.connections.find(c => c.id === connId);
         if (conn) {
            const sourceEl = document.querySelector(`.card-connector[data-conn-id="${conn.sourceId}"]`);
            const targetEl = document.querySelector(`.card-connector[data-conn-id="${conn.targetId}"]`);
            if (sourceEl && targetEl) {
                updateDetailConnectionPath(path, sourceEl, targetEl);
            }
         }
    });
}

function handleCardDragStart(e) {
    if (e.button !== 0) return;
    const card = e.target.closest('.detail-card');
    if (!card) return;

    // Prevent default drag
    e.preventDefault();
    e.stopPropagation();

    activeDragCardId = card.id;
    
    // Calculate offset relative to card
    const rect = card.getBoundingClientRect();
    const wrapper = document.getElementById('detail-board-wrapper');
    const wrapperRect = wrapper.getBoundingClientRect();

    // The card pos (left/top) is inside wrapper scaling space.
    // Offset should be in screen pixels or wrapper pixels?
    // We want: item.x = (mouseX - wrapperLeft)/scale - offset
    // offset = (mouseX - wrapperLeft)/scale - item.x
    
    // Let's use simple logic: offset in scaled coords
    // Offset X = (mouseX - CardScreenX) // No, that's screen pix.
    
    // We act as if we are dragging the point on the card where we clicked.
    // So newX + offset = mouseX_in_board.
    
    // currentCardDragOffset = mouse_relative_to_card_top_left (in Scaled Coords)
    
    // We know card.style.left is the card's x. 
    // Mouse in board x: (e.clientX - wrapperRect.left)/scale
    
    const mouseInBoardX = (e.clientX - wrapperRect.left) / currentTransform.scale;
    const mouseInBoardY = (e.clientY - wrapperRect.top) / currentTransform.scale;
    
    const cardX = parseFloat(card.style.left) || 0;
    const cardY = parseFloat(card.style.top) || 0;
    
    currentCardDragOffset = {
        x: mouseInBoardX - cardX,
        y: mouseInBoardY - cardY
    };
    
    card.style.zIndex = 1000;
}

function handleCardDragMove(e) {
    if (!activeDragCardId || !currentOpenBucketId) return;
    e.preventDefault();

    // With transform, delta must be scaled
    // We already have mouse movement. 
    // Let's recalculate Position based on mouse delta?
    // OR: Use getTransformedPoint math.
    
    const wrapper = document.getElementById('detail-board-wrapper');
    const wrapperRect = wrapper.getBoundingClientRect();
    
    // Mouse in Wrapper Coords
    let newX = (e.clientX - wrapperRect.left - currentCardDragOffset.x) / currentTransform.scale;
    let newY = (e.clientY - wrapperRect.top - currentCardDragOffset.y) / currentTransform.scale;

    // // Boundaries? Infinite board -> No boundaries
    // if (newX < 0) newX = 0;
    // if (newY < 0) newY = 0;

    const el = document.getElementById(activeDragCardId);
    if (el) {
        el.style.left = newX + 'px';
        el.style.top = newY + 'px';
        updateDetailLines();
    }
}

function handleCardDragEnd(e) {
    if (activeDragCardId && currentOpenBucketId) {
        const el = document.getElementById(activeDragCardId);
        if (el) {
            el.style.zIndex = '';
            const instanceId = activeDragCardId.replace('card-', '');
            const newX = parseInt(el.style.left);
            const newY = parseInt(el.style.top);

            // Update State
            const bucket = state.buckets.find(b => b.id === currentOpenBucketId);
            if (bucket) {
                const item = bucket.items.find(i => i.instanceId === instanceId);
                if (item) {
                    item.x = newX;
                    item.y = newY;
                    actions.updateBucket(bucket.id, { items: bucket.items });
                }
            }
        }
    }
    activeDragCardId = null;
}

function closeBucketDetail() {
    document.getElementById('bucket-detail-overlay').classList.add('hidden');
    currentOpenBucketId = null;
}

// Removed syncSidebarVisibility to persist side panel items (Move -> Copy)


function renderBucket(bucket) {
    const el = document.createElement('div');
    el.className = 'bucket';
    el.id = bucket.id;
    el.style.left = bucket.x + 'px';
    el.style.top = bucket.y + 'px';

    // Click to Open Detail
    el.addEventListener('click', (e) => {
        // Did we click a delete button or editable title?
        if (e.target.closest('.delete-bucket-btn') || e.target.closest('h3')) return;
        
        openBucketDetail(bucket.id);
    });

    el.innerHTML = `
        <div class="bucket-handle"></div>
        <div class="bucket-body-visual">
            <div class="bucket-rim-back"></div>
            <div class="bucket-front-shape"></div>
            <div class="bucket-rim-front"></div>
        </div>
    `;

    const foreground = document.createElement('div');
    foreground.className = 'bucket-foreground';
    el.appendChild(foreground);

    const header = document.createElement('div');
    header.className = 'bucket-header';
    const bucketLabel = bucket.label || '';
    
    header.innerHTML = `
        <h3 contenteditable="false" spellcheck="false">${bucketLabel}</h3>
    `;
    
    const h3 = header.querySelector('h3');
    
    // Rename Logic is now handled by Context Menu which sets contentEditable=true
    // We just need to handle saving when blur occurs IF it was editable
    h3.addEventListener('blur', () => {
        if (h3.isContentEditable) {
            h3.contentEditable = false;
            actions.updateBucket(bucket.id, { label: h3.innerText });
        }
    });
    
    h3.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            h3.blur();
        }
    });

    // Stop propagation so we can still select text if needed, 
    // but mainly to prevent drag start from text click if that was an issue.
    // However, if we want dragging properly, maybe allow propagation?
    // User wants "Prevent rename on click". By default it won't rename since contentEditable is false.
    // If we click text, it shouldn't trigger drag if we want to select? 
    // But usually non-editable text should be draggable in this UI context?
    // Let's allow drag from header text for better UX if not editing.
    // So we DON'T stop propagation here unless editing?
    
    h3.addEventListener('mousedown', (e) => {
        if (h3.isContentEditable) {
            e.stopPropagation();
        }
    });

    header.addEventListener('mousedown', (e) => {
        // Drag if not editing
        if (!h3.isContentEditable) {
            // Initiate Drag (re-using global logic or emitting event)
            // The previous code called startBucketDrag which might not exist in this scope 
            // or was a placeholder in my mind? 
            // Wait, previous code had: startBucketDrag(e, bucket.id);
            // I need to check if startBucketDrag exists. 
            // If not, I should likely trigger the bus 'bucket:dragstart' or use handleBucketDragStart logic.
            // Actually, handleBucketDragStart is likely attached to the bucket element itself?
            // Let's check where handleBucketDragStart is used.
            // Previous file view didn't show the full file top/bottom.
            // Assuming global drag handling.
            // But 'header' is inside 'foreground' inside 'bucket'.
            // If I don't stop propagation, it bubbles to bucket?
        }
    });

    foreground.appendChild(header);

    const content = document.createElement('div');
    content.className = 'bucket-content';
    foreground.appendChild(content);

    bucket.items.forEach(item => {
        const dom = createBucketItemDOM(item, bucket.id);
        if (dom) content.appendChild(dom);
    });

    el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    
    el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation(); 
        
        const json = e.dataTransfer.getData('application/json');
        if (!json) return;
        const data = JSON.parse(json);

        if (data.type === 'sidebar-item') {
            // Check for duplicate (Prevent adding same App/Hub twice)
            const alreadyExists = bucket.items.some(existing => existing.id === data.id);
            if (alreadyExists) {
                showToast(`"${data.label}" is already in this bucket.`);
                return;
            }

            const newItem = { ...data, instanceId: 'item-' + Date.now() };
            actions.addItemToBucket(bucket.id, newItem);
            
            // Only render if NOT app/hub
            const dom = createBucketItemDOM(newItem, bucket.id);
            if (dom) content.appendChild(dom);
        }
    });

    bucketsContainer.appendChild(el);
}

function createBucketItemDOM(item, bucketId) {
    // Don't show Apps or Hubs in the list, just store them
    if (item.nodeType === 'app' || item.nodeType === 'hub') {
        return null;
    }

    const el = document.createElement('div');
    el.className = 'bucket-item';
    
    const header = document.createElement('div');
    header.className = 'bucket-item-header';
    header.innerHTML = `
        <div style="flex:1; display:flex; align-items:center; gap:5px;">
           <span>${item.label}</span>
        </div>
        <div class="item-actions">
           <span class="settings-btn" title="Settings">⚙️</span>
           <span class="delete-item-btn" title="Remove">×</span>
        </div>
    `;
    
    const settingsPanel = document.createElement('div');
    settingsPanel.className = 'item-settings hidden';
    settingsPanel.innerHTML = `
        <div class="control-group">
            <label>API Key</label>
            <input type="password" value="sk_test_12345" disabled>
        </div>
        <div class="control-group">
            <label>Timeout (ms)</label>
            <input type="number" value="5000">
        </div>
    `;
    
    header.querySelector('.settings-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.toggle('hidden');
    });
    
    header.querySelector('.delete-item-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Remove item?')) {
             actions.removeItemFromBucket(bucketId, item.instanceId); 
             el.remove();
        }
    });
    
    el.appendChild(header);
    el.appendChild(settingsPanel);

    if (item.variables) {
        const varList = document.createElement('div');
        varList.className = 'variable-list';
        item.variables.forEach(v => {
            const vEl = document.createElement('div');
            vEl.className = 'variable';
            const uniqueId = `${bucketId}:${item.instanceId}:${v.id}`;
            vEl.dataset.connectionId = uniqueId;
            
            vEl.innerHTML = `<span>${v.label}</span><div class="connector-dot"></div>`;
            varList.appendChild(vEl);
        });
        el.appendChild(varList);
    }
    
    return el;
}

function startBucketDrag(e, bucketId) {
    activeDragBucketId = bucketId;
    const el = document.getElementById(bucketId);
    if (!el) return;

    el.classList.add('dragging');
    
    const rect = el.getBoundingClientRect();
    currentDragOffset.x = e.clientX - rect.left;
    currentDragOffset.y = e.clientY - rect.top;
}

function handleBucketDragMove(e) {
    if (!activeDragBucketId) return;
    e.preventDefault();

    const bucketData = state.buckets.find(b => b.id === activeDragBucketId);
    if (!bucketData) return;

    const canvasRect = canvas.getBoundingClientRect();
    
    let newX = e.clientX - canvasRect.left - currentDragOffset.x;
    let newY = e.clientY - canvasRect.top - currentDragOffset.y;

    bucketData.x = newX;
    bucketData.y = newY;

    const el = document.getElementById(activeDragBucketId);
    if (el) {
        el.style.left = newX + 'px';
        el.style.top = newY + 'px';
    }

    updateConnections();
}

function handleBucketDragEnd() {
    if (activeDragBucketId) {
        const el = document.getElementById(activeDragBucketId);
        if (el) el.classList.remove('dragging');
        activeDragBucketId = null;
    }
}

function initSidebar() {
    // Attach Listeners to existing HTML for folder toggling
    document.querySelectorAll('.tree-header[data-toggle="folder"]').forEach(folderHeader => {
        folderHeader.addEventListener('click', () => {
            const item = folderHeader.closest('.tree-item');
            if (item) item.classList.toggle('expanded');
        });
    });

    // Attach Listeners for Draggable Items
    document.querySelectorAll('.tree-header[draggable="true"]').forEach(dragItem => {
         dragItem.addEventListener('dragstart', (e) => {
            let jsonStr = dragItem.dataset.dragJson;
            
            // USER REQUEST: Drop entire App even if variable is dragged.
            // Check if this item is a child of a draggable App/Hub (Parent Folder)
            // Structure: App Item -> Children -> Variable Item (dragItem)
            const parentGroup = dragItem.closest('.tree-children');
            if (parentGroup) {
                const parentItem = parentGroup.closest('.tree-item');
                if (parentItem) {
                    const parentHeader = parentItem.querySelector('.tree-header');
                    // If parent has JSON, use that instead (it's the full App definition)
                    if (parentHeader && parentHeader.dataset.dragJson) {
                         // Only override if the parent is actually an App/Hub (has variables)
                         // The Groups (Web Apps/Hubs) don't have drag-json so they are safe.
                         jsonStr = parentHeader.dataset.dragJson;
                    }
                }
            }

            if (jsonStr) {
                e.dataTransfer.setData('application/json', jsonStr);
                e.dataTransfer.effectAllowed = 'copy'; // Changed to copy
            }
         });
    });
}

function showToast(message) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    
    // Clear previous timeout if any
    if (toast.dataset.timeoutId) clearTimeout(Number(toast.dataset.timeoutId));
    
    const id = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
    toast.dataset.timeoutId = id;
}

 // ==========================================
 // 6. RUN SIMULATION
 // ==========================================
 

 // ==========================================
 // 6. RUN SIMULATION
 // ==========================================
 

 function initRunSimulation() {
     const detailBtn = document.getElementById('detail-run-btn');

     if (detailBtn) attachRunListener(detailBtn, 'detail');
 }

 function attachRunListener(btn, context) {
     btn.addEventListener('click', () => {
         // Visual Feedback
         const originalText = btn.innerHTML;
         btn.innerHTML = '<span class="icon">⏳</span> Running...';
         btn.style.pointerEvents = 'none';
         btn.style.opacity = '0.7';
         
         // Logic to determine what to animate based on Context + State
         let connectionCount = 0;
         
         if (context === 'detail' || (context === 'global' && currentOpenBucketId)) {

         
         if (currentOpenBucketId) {
             // DETAIL VIEW
             const svgLayer = document.getElementById('detail-connection-layer');
             const wrapper = document.getElementById('detail-board-wrapper');
             
             if (svgLayer && wrapper) {
                 const visiblePaths = svgLayer.querySelectorAll('.detail-connection-path:not(.preview)');
                 visiblePaths.forEach((path, index) => {
                     connectionCount++;
                     animateBead(path, index * 200, wrapper); 
                 });
             }
         } else {
             // GLOBAL VIEW
             // Use the global connection layer and global container
             const svgLayer = document.getElementById('connection-layer');
             const container = document.getElementById('app-container'); // Or canvas?
             // The global layer is absolute 0,0 of app-container.
             
             if (svgLayer && container) {
                  const visiblePaths = svgLayer.querySelectorAll('.connection-path:not(.preview)');
                  visiblePaths.forEach((path, index) => {
                     connectionCount++;
                     // Global paths might be long, let's speed up or keep same?
                     animateBead(path, index * 100, container); 
                  });
             }
         }
 

         if (connectionCount === 0) {
             showToast("No active connections to simulate.");
             resetBtn();
             return;
         }
 
         // Reset Button after max duration
         const maxDuration = 2000 + (connectionCount * 200);
         setTimeout(() => {
             resetBtn();
             showToast("Simulation Complete!");
         }, maxDuration);
 
         function resetBtn() {
             btn.innerHTML = originalText;
             btn.style.pointerEvents = '';
             btn.style.opacity = '';
         }
 }});
 }

 function animateBead(pathElement, delay, container) {
     const pathData = pathElement.getAttribute('d');
     if (!pathData) return;
 
     // Container fallback
     if (!container) return;
 
     const bead = document.createElement('div');
     bead.className = 'simulation-bead';
     
     // 1. CSS Motion Path
     // We dynamically set the offset-path to the SVG path data
     bead.style.offsetPath = `path('${pathData}')`;
     bead.style.animation = `travel 1.5s ease-in-out forwards`;
     bead.style.animationDelay = `${delay}ms`;
     
     // 2. Positioning
     // The bead needs to be absolutely positioned within the SAME coordinate context as the path.
     // For Detail View: 'wrapper' (transformed).
     // For Global View: 'app-container'.
     // 'offset-path' takes care of the movement along that coordinate system.
     // However, we must ensure 'top:0; left:0;' is set so it starts at 0,0 of the container 
     // and then the path moves it.
     bead.style.top = '0';
     bead.style.left = '0';
     
     container.appendChild(bead);
 
     // Cleanup
     setTimeout(() => {
         bead.remove();
     }, 1500 + delay + 100);
 }

 window.addEventListener('DOMContentLoaded', initRunSimulation);

 // ==========================================
 // 7. MINIMAP & CONTEXT MENU
 // ==========================================

 window.addEventListener('DOMContentLoaded', () => {
     initMinimap();
     initContextMenu();
 });

 let minimapInterval;

 function initMinimap() {
     const minimap = document.getElementById('minimap');
     if (!minimap) return;

     // Update loop (efficient enough for demo)
     minimapInterval = setInterval(renderMinimap, 100);
 }

 function renderMinimap() {
     const minimap = document.getElementById('minimap');
     const viewportIndicator = document.getElementById('minimap-viewport');
     if (!minimap) return;

     // CONSTANTS (Minimap Size)
     const MM_W = 200;
     const MM_H = 150;

     // Clear old nodes (keep viewport)
     Array.from(minimap.children).forEach(child => {
         if (child.id !== 'minimap-viewport') child.remove();
     });

     if (currentOpenBucketId) {
         // --- DETAIL MODE ---
         // Show Cards relative to "Infinite Board"
         const bucket = state.buckets.find(b => b.id === currentOpenBucketId);
         if (!bucket) return;

         // We need to map the "Virtual Board Area" to the Minimap
         // Let's assume a large virtual area, e.g., 3000x3000 centered?
         // Or finding bounds of all items.
         
         let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
         
         if (bucket.items.length === 0) {
             // Default bounds
             minX = 0; maxX = 800; minY = 0; maxY = 600;
         } else {
             bucket.items.forEach(item => {
                 minX = Math.min(minX, item.x);
                 minY = Math.min(minY, item.y);
                 maxX = Math.max(maxX, item.x + 320); // Card Width
                 maxY = Math.max(maxY, item.y + 200); // Card Height approx
             });
         }
         
         // Pad
         minX -= 500; minY -= 500; maxX += 500; maxY += 500;
         const worldW = maxX - minX;
         const worldH = maxY - minY;

         // Render Nodes
         bucket.items.forEach(item => {
             const node = document.createElement('div');
             node.className = 'minimap-node';
             node.style.width = mapRange(320, 0, worldW, 0, MM_W) + 'px';
             node.style.height = mapRange(100, 0, worldH, 0, MM_H) + 'px'; // Header height visual
             node.style.left = mapRange(item.x, minX, maxX, 0, MM_W) + 'px';
             node.style.top = mapRange(item.y, minY, maxY, 0, MM_H) + 'px';
             node.style.background = 'var(--accent)'; // Detail nodes are accent color
             minimap.appendChild(node);
         });

         // Viewport Indicator
         // We need the Current Inverse Transform logic to know what part of world is visible
         const container = document.getElementById('detail-cards-container');
         if (container && viewportIndicator) {
             const rect = container.getBoundingClientRect(); // visible area size
             // visibleX = (-transX) / scale
             // visibleW = (rect.width) / scale
             
             const vX = -currentTransform.x / currentTransform.scale;
             const vY = -currentTransform.y / currentTransform.scale;
             const vW = rect.width / currentTransform.scale;
             const vH = rect.height / currentTransform.scale;
             
             viewportIndicator.style.display = 'block';
             viewportIndicator.style.left = mapRange(vX, minX, maxX, 0, MM_W) + 'px';
             viewportIndicator.style.top = mapRange(vY, minY, maxY, 0, MM_H) + 'px';
             viewportIndicator.style.width = mapRange(vW, 0, worldW, 0, MM_W) + 'px';
             viewportIndicator.style.height = mapRange(vH, 0, worldH, 0, MM_H) + 'px';
         }

     } else {
         // --- GLOBAL MODE ---
         // Show Buckets relative to Canvas
         // Canvas is containerWidth x containerHeight (viewport)
         // But buckets can be dragged anywhere.
         // Let's assume World = Canvas Size for simplicity inside this demo, 
         // or dynamic bounds if they go off screen.
         
         const canvas = document.getElementById('canvas');
         if (!canvas) return;
         const rect = canvas.getBoundingClientRect();
         
         // Use static world size for Global: 0,0 to Width,Height (overflow hidden typically)
         // or verify bucket bounds.
         const worldW = rect.width;
         const worldH = rect.height;

         state.buckets.forEach(bucket => {
             const node = document.createElement('div');
             node.className = 'minimap-node';
             node.style.width = mapRange(160, 0, worldW, 0, MM_W) + 'px'; // Bucket W
             node.style.height = mapRange(100, 0, worldH, 0, MM_H) + 'px'; // Bucket Handle visual
             node.style.left = mapRange(bucket.x, 0, worldW, 0, MM_W) + 'px';
             node.style.top = mapRange(bucket.y, 0, worldH, 0, MM_H) + 'px';
             
             minimap.appendChild(node);
         });
         
         if (viewportIndicator) {
             viewportIndicator.style.display = 'none'; // Global view doesn't have pan/zoom yet
         }
     }
 }

 function mapRange(value, inMin, inMax, outMin, outMax) {
     return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
 }

 // --- Helper: Disconnect Single Point ---
function disconnectPoint(connId) {
    if (!currentOpenBucketId || !connId) return;
    
    // Remove connections where source OR target matches this specific point ID
    const toRemove = state.connections.filter(c => c.sourceId === connId || c.targetId === connId);
    
    if (toRemove.length === 0) return;

    toRemove.forEach(c => {
        actions.removeConnection(c.id);
    });
    
    renderDetailConnections(currentOpenBucketId);
}

// --- Context Menu ---
 function initContextMenu() {
     const menu = document.getElementById('context-menu');
     if (!menu) return;

     document.addEventListener('contextmenu', (e) => {
         e.preventDefault();
         
         // Decide Content based on Target
         const targetConnector = e.target.closest('.card-variable-row');
         const targetSidebarItem = e.target.closest('.tree-header');
         const targetBucket = e.target.closest('.bucket');
         const targetCard = e.target.closest('.detail-card');
         
         let items = [];
         
         if (targetConnector) {
             const connId = targetConnector.dataset.connId;
             items = [
                 { label: 'Disconnect This Point', icon: '✂️', action: () => disconnectPoint(connId) }
             ];
         } else if (targetSidebarItem) {
             // Sidebar Actions
             try {
                const data = JSON.parse(targetSidebarItem.dataset.dragJson);
                if (data.id && data.id.startsWith('custom-')) {
                    items = [
                        { label: 'Delete Custom Item', icon: '🗑️', action: () => deleteSidebarItem(data.id, targetSidebarItem) }
                    ];
                }
             } catch(e) {}
         } else if (targetCard) {
             // Card Actions
             const cardId = targetCard.id.replace('card-', '');
             items = [
                 { label: 'Disconnect All', icon: '🔌', action: () => disconnectAllCardConnections(cardId) },
                 { label: 'Delete', icon: '🗑️', action: () => deleteCard(cardId) }
             ];
         } else if (targetBucket) {
             // Bucket Actions
             items = [
                 { label: 'Rename', icon: 'Tt', action: () => {
                     const h3 = targetBucket.querySelector('h3');
                     h3.contentEditable = true; 
                     h3.focus();
                     // Select all text
                     const range = document.createRange();
                     range.selectNodeContents(h3);
                     const sel = window.getSelection();
                     sel.removeAllRanges();
                     sel.addRange(range);
                     
                     h3.onblur = () => {
                         h3.contentEditable = false;
                         actions.updateBucket(targetBucket.id, { label: h3.innerText });
                     };
                 }},
                 { label: 'Change Color', icon: '🎨', action: (e) => changeBucketColor(targetBucket.id, e) },
                 { separator: true },
                 { label: 'Delete Bucket', icon: '×', action: () => {
                     if (confirm('Delete this bucket?')) {
                        actions.removeBucket(targetBucket.id);
                     }
                 }}
             ];
         } else {
             // Background Actions
             if (currentOpenBucketId) {
                 // Detail View Background
                 items = [
                    { label: 'Close Detail', icon: '↩', action: () => closeBucketDetail() }
                 ];
             } else {
                 // Global Background
                 items = [
                     { label: 'New Bucket', icon: 'bw', action: () => document.getElementById('create-bucket-btn').click() },
                     { separator: true },
                     { label: 'Reset View', icon: '↺', action: () => window.location.reload() }
                 ];
             }
         }

         renderContextMenu(e.clientX, e.clientY, items);
     });

     // Close on Click
     document.addEventListener('click', () => {
         menu.classList.add('hidden');
     });
 }

function deleteSidebarItem(id, element) {
    if (confirm('Delete this custom item and all its instances?')) {
        // 1. Update Sidebar State
        if (state.customTemplates) {
             state.customTemplates = state.customTemplates.filter(t => t.id !== id);
             // Save happens in removeItemFromBucket too, but we need to ensure sidebar state is saved.
             saveState(); 
        }
        
        // 2. Update Sidebar DOM
        if (element) {
            const treeItem = element.closest('.tree-item');
            if (treeItem) treeItem.remove();
        }

        // 3. Cascading Delete (Remove from Buckets)
        // We need to find all instances first to avoid concurrent modification issues logic
        const removalTasks = [];
        state.buckets.forEach(bucket => {
            if (bucket.items) {
                bucket.items.forEach(item => {
                    if (item.id === id) { // item.id is the Sidebar ID (e.g. custom-app-123)
                        removalTasks.push({ bucketId: bucket.id, instanceId: item.instanceId });
                    }
                });
            }
        });

        // Execute removals
        removalTasks.forEach(task => {
            actions.removeItemFromBucket(task.bucketId, task.instanceId);
        });
        
        saveState(); // Final save
    }
}

 function renderContextMenu(x, y, items) {
     const menu = document.getElementById('context-menu');
     if (!menu) return;
     menu.innerHTML = '';
     
     items.forEach(item => {
         if (item.separator) {
             const div = document.createElement('div');
             div.className = 'context-divider';
             menu.appendChild(div);
         } else {
             const div = document.createElement('div');
             div.className = 'context-item';
             div.innerHTML = `<span>${item.icon}</span> <span>${item.label}</span>`;
             div.addEventListener('click', (e) => {
                 e.stopPropagation(); 
                 // Special handling: if action returns true, don't close?
                 // or just always clos unless...
                 // Current logic: item.action() closes.
                 // For Change Color, we want to RE-OPEN.
                 // So we close first (reset) then action opens new.
                 menu.classList.add('hidden');
                 item.action(e); // Pass event
             });
             menu.appendChild(div);
         }
     });

     // Boundary Check (Basic)
     const maxX = window.innerWidth - 200;
     const maxY = window.innerHeight - 200;
     
     menu.style.left = Math.min(x, maxX) + 'px';
     menu.style.top = Math.min(y, maxY) + 'px';
     menu.classList.remove('hidden');
 }

 // --- Actions ---

 function duplicateCard(instanceId) {
     if (!currentOpenBucketId) return;
     const bucket = state.buckets.find(b => b.id === currentOpenBucketId);
     if (!bucket) return;

     const original = bucket.items.find(i => i.instanceId === instanceId);
     if (!original) return;

     // Clone
     const newItem = JSON.parse(JSON.stringify(original));
     newItem.instanceId = 'item-' + Date.now();
     newItem.x += 20;
     newItem.y += 20;

     actions.addItemToBucket(bucket.id, newItem);
     // Re-render handled by add? actually addItemToBucket emits update, but logic inside might not auto-render DOM unless we refresh detail
     openBucketDetail(bucket.id); 
 }

 function disconnectAllCardConnections(instanceId) {
    if (!currentOpenBucketId) return;
    
    // Connections use "bucketId:instanceId:varId"
    const prefix = `${currentOpenBucketId}:${instanceId}`;
    
    const toRemove = state.connections.filter(c => c.sourceId.includes(prefix) || c.targetId.includes(prefix));
    
    toRemove.forEach(c => {
        actions.removeConnection(c.id);
    });
    
    renderDetailConnections(currentOpenBucketId);
 }

 function changeBucketColor(bucketId, e) {
     const bucket = state.buckets.find(b => b.id === bucketId);
     if (!bucket) return;
     
     // 16 "Vibe" Gradients
     const gradients = [
        'linear-gradient(135deg, #ef4444, #b91c1c)', // Red
        'linear-gradient(135deg, #f97316, #c2410c)', // Orange
        'linear-gradient(135deg, #f59e0b, #d97706)', // Amber
        'linear-gradient(135deg, #eab308, #ca8a04)', // Yellow
        'linear-gradient(135deg, #84cc16, #4d7c0f)', // Lime
        'linear-gradient(135deg, #22c55e, #15803d)', // Green
        'linear-gradient(135deg, #10b981, #047857)', // Emerald
        'linear-gradient(135deg, #14b8a6, #0f766e)', // Teal
        'linear-gradient(135deg, #06b6d4, #0e7490)', // Cyan
        'linear-gradient(135deg, #0ea5e9, #0369a1)', // Sky
        'linear-gradient(135deg, #3b82f6, #1d4ed8)', // Blue
        'linear-gradient(135deg, #6366f1, #4338ca)', // Indigo
        'linear-gradient(135deg, #8b5cf6, #6d28d9)', // Violet
        'linear-gradient(135deg, #a855f7, #7e22ce)', // Purple
        'linear-gradient(135deg, #d946ef, #a21caf)', // Fuchsia
        'linear-gradient(135deg, #ec4899, #be185d)'  // Pink
     ];
     
     // Re-use context menu to show grid
     const menu = document.getElementById('context-menu');
     menu.innerHTML = '';
     
     const title = document.createElement('div');
     title.className = 'context-item';
     title.style.pointerEvents = 'none';
     title.style.fontWeight = 'bold';
     title.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
     title.innerText = 'Select Color';
     menu.appendChild(title);

     const grid = document.createElement('div');
     grid.className = 'color-grid';
     
     gradients.forEach(grad => {
         const swatch = document.createElement('div');
         swatch.className = 'color-swatch';
         swatch.style.background = grad;
         
         swatch.onclick = (e) => {
             e.stopPropagation();
             // Apply Color
             actions.updateBucket(bucketId, { color: grad });
             
             // Update DOM
             const el = document.getElementById(bucketId);
             if (el) {
                 const shape = el.querySelector('.bucket-front-shape');
                 if (shape) shape.style.background = grad;
                 
                 const inside = el.querySelector('.bucket-rim-back');
                 if (inside) {
                     inside.style.background = grad;
                     inside.style.filter = 'brightness(0.4)'; // Darker for depth
                 }
                 
                 const rim = el.querySelector('.bucket-rim-front');
                 if (rim) {
                     // Extract first color from gradient for the rim border
                     // format: linear-gradient(..., #color1, #color2)
                     const match = grad.match(/#(?:[0-9a-fA-F]{3}){1,2}/);
                     if (match) {
                         rim.style.borderColor = match[0];
                     }
                 }
             }
             
             menu.classList.add('hidden');
         };
         grid.appendChild(swatch);
     });
     
     menu.appendChild(grid);
     menu.classList.remove('hidden'); // Ensure it stays open (it might have closed if we didn't stop prop, but we coming from action which closed it)
     
     // IMPORTANT: We need to re-position or keep position.
     // Since 'changeBucketColor' was called AFTER menu closed (in previous step), 
     // we need to re-open it. 
     // BUT, we don't have mouse coordinates here unless passed.
     // Easier approach: The 'action' in initContextMenu passes the event or we grab existing.
     
     // Let's modify initContextMenu to NOT hide immediately if we want to show submenu?
     // Or just re-show it at center of bucket?
     const el = document.getElementById(bucketId);
     if (el) {
         const rect = el.getBoundingClientRect();
         menu.style.left = (rect.left + rect.width/2) + 'px';
         menu.style.top = (rect.top + rect.height/2) + 'px';
         menu.classList.remove('hidden');
     }
 }

 function deleteCard(instanceId) {
      // Helper to trigger delete logic from outside
      if (currentOpenBucketId) {
          const bucket = state.buckets.find(b => b.id === currentOpenBucketId);
          if (bucket) {
              const newItems = bucket.items.filter(i => i.instanceId !== instanceId);
              actions.updateBucket(bucket.id, { items: newItems });
              openBucketDetail(bucket.id);
          }
      }
 }


// ==========================================
// CUSTOM TEMPLATE CREATOR LOGIC
// ==========================================

const addItemBtn = document.getElementById('add-item-btn');
// ==========================================
// CUSTOM TEMPLATE CREATOR LOGIC
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const addItemBtn = document.getElementById('add-item-btn');
    const addItemDropdown = document.getElementById('add-item-dropdown');
    const createItemModal = document.getElementById('create-item-modal');
    const modalTitle = document.getElementById('modal-title');
    const customItemName = document.getElementById('custom-item-name');
    const variableRowsContainer = document.getElementById('variable-rows-container');
    const addVariableBtn = document.getElementById('add-variable-btn');
    const confirmCreateBtn = document.getElementById('confirm-create-btn');
    const cancelCreateBtn = document.getElementById('cancel-create-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');

    let currentCreateType = 'app'; // 'app' or 'hub'

    // 1. Dropdown Toggle
    if (addItemBtn && addItemDropdown) {
        addItemBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addItemDropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!addItemBtn.contains(e.target) && !addItemDropdown.contains(e.target)) {
                addItemDropdown.classList.add('hidden');
            }
        });

        addItemDropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                currentCreateType = item.dataset.type;
                openCreateModal(currentCreateType);
                addItemDropdown.classList.add('hidden');
            });
        });
    }

    // 2. Modal Logic
    function openCreateModal(type) {
        if (!createItemModal) return;
        
        const typeLabel = type === 'app' ? 'Web App' : 'Hub';
        modalTitle.textContent = `Create New ${typeLabel}`;
        customItemName.value = '';
        variableRowsContainer.innerHTML = ''; // Clear rows
        
        // Add one default row
        addVariableRow();
        
        createItemModal.classList.remove('hidden');
        customItemName.focus();
    }

    function closeCreateModal() {
        if (createItemModal) createItemModal.classList.add('hidden');
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeCreateModal);
    if (cancelCreateBtn) cancelCreateBtn.addEventListener('click', closeCreateModal);

    // 3. Variable Rows
    if (addVariableBtn) {
        addVariableBtn.addEventListener('click', () => addVariableRow());
    }

    function addVariableRow() {
        const row = document.createElement('div');
        row.className = 'variable-form-row';
        row.innerHTML = `
            <input type="text" placeholder="Variable Name" class="var-name-input">
            <select class="var-type-select">
                <option value="data">Data</option>
                <option value="trigger">Trigger</option>
            </select>
            <button class="btn-row-delete" title="Remove">×</button>
        `;
        
        row.querySelector('.btn-row-delete').addEventListener('click', () => {
            row.remove();
        });
        
        variableRowsContainer.appendChild(row);
        // Focus new input
        row.querySelector('input').focus();
    }

    // 4. Create Logic
    if (confirmCreateBtn) {
        confirmCreateBtn.addEventListener('click', () => {
            const name = customItemName.value.trim();
            if (!name) {
                alert('Please enter a name');
                return;
            }
            
            // Collect Variables
            const variables = [];
            const rows = variableRowsContainer.querySelectorAll('.variable-form-row');
            
            rows.forEach((row, index) => {
                const varName = row.querySelector('.var-name-input').value.trim();
                const varType = row.querySelector('.var-type-select').value;
                
                if (!varName) return; 
                
                variables.push({
                    id: `v-custom-${Date.now()}-${index}`,
                    label: varName,
                    type: varType
                });
            });
            
            // SAVE TO STATE
            const tId = `custom-${currentCreateType}-${Date.now()}`;
            const newTemplate = {
                id: tId,
                label: name,
                nodeType: currentCreateType,
                variables: variables
            };
            
            if (!state.customTemplates) state.customTemplates = [];
            state.customTemplates.push(newTemplate);
            saveState();

            createNewSidebarItem(name, currentCreateType, variables, tId);
            closeCreateModal();
        });
    }

    // 5. Render Saved Templates
    function renderCustomTemplates() {
        if (state.customTemplates && state.customTemplates.length > 0) {
            state.customTemplates.forEach(t => {
                // Ensure variables is an array to prevent crash
                createNewSidebarItem(t.label, t.nodeType, t.variables || [], t.id);
            });
        }
    }
    
    // Initial Render
    renderCustomTemplates();

    function createNewSidebarItem(name, type, variables = [], existingId = null) {
        // 1. Construct Parent JSON (All Variables)
        const itemId = existingId || `custom-${type}-${Date.now()}`;
        const parentDragData = {
            type: 'sidebar-item',
            id: itemId,
            label: name,
            nodeType: type, 
            variables: variables
        };
        
        // 2. Create Shell
        const itemShell = document.createElement('div');
        itemShell.className = 'tree-item'; // Default collapsed
        
        // Escape quotes
        const parentJsonStr = JSON.stringify(parentDragData).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
        
        itemShell.innerHTML = `
            <div class="tree-header" data-toggle="folder" draggable="true" data-drag-json='${parentJsonStr}'>
                <span class="tree-icon arrow"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
                <span>${name}</span>
            </div>
            <div class="tree-children"></div>
        `;
        
        const parentHeader = itemShell.querySelector('.tree-header');
        const childrenContainer = itemShell.querySelector('.tree-children');
        
        // 3. Create Children Items (One per variable)
        variables.forEach(v => {
            const childId = `v-custom-${Date.now()}-${Math.floor(Math.random()*1000)}`;
            const childDragData = {
                type: 'sidebar-item',
                id: childId,
                label: name, 
                nodeType: type,
                variables: [v] 
            };
            
            const childJsonStr = JSON.stringify(childDragData).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
            const varColor = v.type === 'trigger' ? 'var(--accent-cyan)' : 'var(--accent-purple)';
            
            const childDiv = document.createElement('div');
            childDiv.className = 'tree-item';
            childDiv.innerHTML = `
                <div class="tree-header" draggable="true" data-drag-json='${childJsonStr}'>
                    <span class="tree-icon dot" style="background:${varColor}"></span>
                    <span>${v.label}</span>
                </div>
            `;
            
            // Attach Drag Event to Child
            const childHeader = childDiv.querySelector('.tree-header');
            attachDragEvents(childHeader);
            
            childrenContainer.appendChild(childDiv);
        });
        
        // 4. Attach Events to Parent
        // Toggle
        parentHeader.addEventListener('click', () => {
            itemShell.classList.toggle('expanded');
        });
        
        // Drag
        attachDragEvents(parentHeader);

        // 5. Append to correct Sidebar Section
        const sidebar = document.getElementById('template-list');
        if (!sidebar) return;
        
        const headers = Array.from(sidebar.querySelectorAll('.tree-header'));
        const targetLabel = type === 'app' ? 'Web Apps' : 'Hubs';
        const targetHeader = headers.find(h => h.textContent.trim().includes(targetLabel));
        
        if (targetHeader) {
            let targetContainer = targetHeader.nextElementSibling;
            
            const folderItem = targetHeader.closest('.tree-item');
            if (folderItem && !folderItem.classList.contains('expanded')) {
                folderItem.classList.add('expanded');
            }
            
            if (targetContainer && targetContainer.classList.contains('tree-children')) {
                targetContainer.appendChild(itemShell);
                
                // Highlight
                parentHeader.style.background = 'rgba(255,255,255,0.1)';
                setTimeout(() => parentHeader.style.background = '', 1000);
            }
        }
    }
    
    function attachDragEvents(element) {
        element.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/json', element.dataset.dragJson);
            e.dataTransfer.effectAllowed = 'copy';
            element.classList.add('dragging');
        });
        
        element.addEventListener('dragend', () => {
            element.classList.remove('dragging');
        });
    }
});
