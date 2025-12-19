import { state, actions } from './state.js';

let svgLayer;
let activePath = null;
let startNode = null; // DOM element

export function initConnections() {
    svgLayer = document.getElementById('connection-layer');

    // Global listener for clicking variables
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
                // Validate if compatible? (e.g. trigger->trigger or data->data is ok, maybe type check later)
                completeConnection(startNode, targetEl);
            } else {
                // Cancel
                activePath.remove();
            }
            activePath = null;
            startNode = null;
            
            document.querySelectorAll('.variable.highlight').forEach(el => el.classList.remove('highlight'));
        }
    });

    // Delete connection on click (selection logic)
    // We bind click on SVG paths
    svgLayer.addEventListener('click', (e) => {
        if (e.target.classList.contains('connection-path')) {
             const connId = e.target.id.replace('conn-', '');
             // Ideally select it first, then delete key. 
             // But for simplicity/speed: Confirm and delete?
             // Or just toggle 'selected' class and listen for Delete key.
             
             // Let's do instant helper: simple click to remove for this prototype phases?
             // Or implement selection state.
             
             // Feature: "Click to select(highlight), Press Delete to remove"
             document.querySelectorAll('.connection-path.selected').forEach(p => p.classList.remove('selected'));
             e.target.classList.add('selected');
             e.stopPropagation();
        }
    });

    // Delete key listener
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
    
    // Clear selection on background click
    document.addEventListener('click', (e) => {
         if (!e.target.closest('.connection-path')) {
             document.querySelectorAll('.connection-path.selected').forEach(p => p.classList.remove('selected'));
         }
    });

    // Restore connections from state (after buckets render)
    // We use setTimeout to ensure DOM is ready if called immediately
    setTimeout(() => {
        state.connections.forEach(conn => renderConnection(conn));
    }, 0);
    
    // Listen for connection additions from state? 
    // If we rely on actions, we might get double render if we just render in action.
    // But since `renderConnection` checks persistence, it's fine.
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
    // Find elements
    const sourceEl = document.querySelector(`[data-connection-id="${conn.sourceId}"]`);
    const targetEl = document.querySelector(`[data-connection-id="${conn.targetId}"]`);
    
    if (!sourceEl || !targetEl) {
        console.warn(`Cannot render connection ${conn.id}: endpoints not found.`);
        return;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('connection-path');
    path.id = 'conn-' + conn.id;
    svgLayer.appendChild(path);
    
    updateConnectionPath(conn, path, sourceEl, targetEl);
}

function updateConnectionPath(conn, pathEl, sourceEl, targetEl) {
    // Resolve DOM if not passed (during updates)
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
        // Element might be dragging or hidden
    }
}

export function updateConnections() {
    state.connections.forEach(conn => {
        updateConnectionPath(conn);
    });
}

function getBezierPath(x1, y1, x2, y2) {
    const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const cpOffset = Math.max(50, Math.min(200, dist / 2));
    return `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`;
}
