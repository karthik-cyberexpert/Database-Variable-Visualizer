import { state, actions, emit } from './state.js';
import { updateConnections } from './connections.js';

let canvas;
let bucketsContainer;
let dragSource = null;
let currentDragOffset = { x: 0, y: 0 };
let activeDragBucketId = null;

export function initCanvas() {
    canvas = document.getElementById('canvas');
    bucketsContainer = document.getElementById('buckets-container');

    // Canvas Drag & Drop (Creating Buckets)
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    canvas.addEventListener('drop', handleCanvasDrop);

    // Create Bucket Button
    document.getElementById('create-bucket-btn').addEventListener('click', () => {
        createBucket({ label: 'New Project', type: 'empty-bucket', variables: [] }, 
            canvas.getBoundingClientRect().width / 2 + canvas.getBoundingClientRect().left,
            canvas.getBoundingClientRect().height / 2 + canvas.getBoundingClientRect().top
        );
    });

    // Global Mouse interaction for Dragging Buckets
    // We attach to window/document to handle fast drags that might exit the element
    document.addEventListener('mousemove', handleBucketDragMove);
    document.addEventListener('mouseup', handleBucketDragEnd);

    // Render existing buckets from state (persistence)
    state.buckets.forEach(bucket => renderBucket(bucket));
}

function handleCanvasDrop(e) {
    e.preventDefault();
    const json = e.dataTransfer.getData('application/json');
    if (!json) return;

    try {
        const data = JSON.parse(json);
        
        // Dropping a Sidebar Item -> Create Bucket
        if (data.type === 'sidebar-item') {
            // Check if we dropped ONTO an existing bucket?
            // "dropping an item on empty space should auto-create... dropping on existing bucket should place inside"
            // The existing bucket drop should be handled by the BUCKET element's event listeners, not the canvas.
            // But if the event bubbled up to canvas, it means we missed a bucket.
            // UNLESS the bucket stopped propagation. 
            // Let's implement bucket drop listeners separately or check e.target here.
            
            // If e.target is canvas or bucketsContainer, it's empty space.
            if (e.target.closest('.bucket')) return; // Let the bucket handle it if we somehow got here

            createBucket(data, e.clientX, e.clientY);
        }
    } catch (err) {
        console.error('Invalid drop data', err);
    }
}

function createBucket(itemData, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left - 150; // Center (approx width 300/2)
    const y = clientY - rect.top - 20;

    const bucketId = 'bucket-' + Date.now();
    
    // Create Data
    // Ensure items have instance IDs
    const items = itemData ? [{ ...itemData, instanceId: 'item-' + Date.now() }] : [];
    
    const bucket = {
        id: bucketId,
        x,
        y,
        items
    };
    // Use action
    actions.addBucket(bucket);
    // state.buckets.push(bucket); // Removed direct mutation in favor of action
    // actions.addBucket calls saveState and emit

    // renderBucket(bucket); // Action listener will handle render if we implement reactivity, 
    // but legacy code called renderBucket directly. 
    // Let's refactor main to listen to 'bucket:added' or just render here for now.
    renderBucket(bucket);
}

function renderBucket(bucket) {
    const el = document.createElement('div');
    el.className = 'bucket';
    el.id = bucket.id;
    el.style.left = bucket.x + 'px';
    el.style.top = bucket.y + 'px';

    // Header
    const header = document.createElement('div');
    header.className = 'bucket-header';
    // Use a contenteditable span or input swap for renaming
    
    // We name the bucket. If no label in items, use generic. 
    // We should probably store the bucket Label in the bucket object itself in state.
    // If it's missing, default to "New Bucket".
    const bucketLabel = bucket.label || (bucket.items[0] ? bucket.items[0].label + ' Bucket' : 'New Bucket');
    
    header.innerHTML = `
        <h3 contenteditable="true" spellcheck="false">${bucketLabel}</h3>
        <span class="delete-bucket-btn" title="Delete Bucket">×</span>
    `;
    
    // Rename Logic
    const h3 = header.querySelector('h3');
    h3.addEventListener('blur', () => {
        actions.updateBucket(bucket.id, { label: h3.innerText });
    });
    
    h3.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            h3.blur();
        }
    });
    
    h3.addEventListener('mousedown', e => e.stopPropagation()); // Allow text selection without drag start

    // Delete Bucket Logic
    header.querySelector('.delete-bucket-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger drag
        if (confirm('Delete this bucket and its connections?')) {
            actions.removeBucket(bucket.id);
            el.remove();
        }
    });

    
    // Header drag start
    header.addEventListener('mousedown', (e) => {
        if (e.target !== h3 && e.target !== header.querySelector('.delete-bucket-btn')) {
            startBucketDrag(e, bucket.id);
        }
    });

    el.appendChild(header);

    // Content container
    const content = document.createElement('div');
    content.className = 'bucket-content';
    el.appendChild(content);

    // Render Items
    bucket.items.forEach(item => {
        content.appendChild(createBucketItemDOM(item));
    });

    // Allow dropping other items INTO this bucket
    el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        el.style.borderColor = 'var(--primary)';
    });
    
    el.addEventListener('dragleave', () => {
        el.style.borderColor = 'var(--glass-border)';
    });

    el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Stop bubbling to canvas
        el.style.borderColor = 'var(--glass-border)';
        
        const json = e.dataTransfer.getData('application/json');
        if (!json) return;
        const data = JSON.parse(json);

        if (data.type === 'sidebar-item') {
            // Add to this bucket
            const newItem = { ...data, instanceId: 'item-' + Date.now() };
            actions.addItemToBucket(bucket.id, newItem);
            
            // We need to re-render the bucket content or just append the new item DOM
            // Since we use actions, let's just append DOM manually to avoid full re-render for now
            content.appendChild(createBucketItemDOM(newItem, bucket.id));
        }
    });

    bucketsContainer.appendChild(el);
}

function createBucketItemDOM(item, bucketId) {
    const el = document.createElement('div');
    el.className = 'bucket-item';
    
    // Add delete functionality
    
    const header = document.createElement('div');
    header.className = 'bucket-item-header';
    header.innerHTML = `
        <div style="flex:1; display:flex; align-items:center gap:5px;">
           <span>${item.label}</span>
        </div>
        <div class="item-actions">
           <span class="settings-btn" title="Settings">⚙️</span>
           <span class="delete-item-btn" title="Remove">×</span>
        </div>
    `;
    
    // Settings Logic
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
             actions.removeItemFromBucket(bucketId, item.instanceId); // Need to implement this in actions specific selector
             el.remove();
        }
    });
    
    el.appendChild(header);
    el.appendChild(settingsPanel);

    // Variables
    if (item.variables) {
        const varList = document.createElement('div');
        varList.className = 'variable-list';
        item.variables.forEach(v => {
            const vEl = document.createElement('div');
            vEl.className = 'variable';
            // Unique ID: bucketId : itemInstanceId : variableId
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
    
    // Calculate new relative position
    let newX = e.clientX - canvasRect.left - currentDragOffset.x;
    let newY = e.clientY - canvasRect.top - currentDragOffset.y;

    // Update Data
    bucketData.x = newX;
    bucketData.y = newY;

    // Update DOM
    const el = document.getElementById(activeDragBucketId);
    if (el) {
        el.style.left = newX + 'px';
        el.style.top = newY + 'px';
    }

    // Update Connections
    updateConnections();
}

function handleBucketDragEnd() {
    if (activeDragBucketId) {
        const el = document.getElementById(activeDragBucketId);
        if (el) el.classList.remove('dragging');
        activeDragBucketId = null;
    }
}
