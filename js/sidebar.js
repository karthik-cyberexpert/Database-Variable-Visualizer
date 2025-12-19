import { state } from './state.js';

export function initSidebar() {
    const listContainer = document.getElementById('template-list');
    renderTree(state.templates, listContainer);
}

function renderTree(node, container) {
    // If root, just render children
    if (node.type === 'root') {
        node.children.forEach(child => renderTree(child, container));
        return;
    }

    const itemEl = document.createElement('div');
    itemEl.className = 'tree-item';

    // Header
    const headerEl = document.createElement('div');
    headerEl.className = 'tree-header';
    
    // Icon
    const icon = document.createElement('span');
    icon.className = 'tree-icon arrow';
    // Simple SVG arrow
    icon.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    
    const label = document.createElement('span');
    label.innerText = node.label;

    headerEl.appendChild(icon);
    headerEl.appendChild(label);
    itemEl.appendChild(headerEl);

    // Expand/Collapse click (only for categories)
    if (node.children) {
        headerEl.addEventListener('click', () => {
            itemEl.classList.toggle('expanded');
        });

        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        node.children.forEach(child => renderTree(child, childrenContainer));
        itemEl.appendChild(childrenContainer);
    } else {
        // Leaf node (App or Hub), make base draggable
        // But the requirement says "items (apps/hubs) and variables" are draggable. 
        // Logic: Dragging an App/Hub -> drops into Canvas to create or add to Bucket.
        // Dragging a Variable -> Connects (handled differently usually, but let's see).
        
        // Let's make the Apps/Hubs draggable to the canvas.
        headerEl.setAttribute('draggable', 'true');
        // Remove arrow if leaf
        icon.className = 'tree-icon leaf';
        icon.innerHTML = node.type === 'app' 
            ? `<svg viewBox="0 0 24 24"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm0 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>` // Grid icon
            : `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`; // Globe/Hub icon

        headerEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/json', JSON.stringify({
                type: 'sidebar-item',
                id: node.id,
                label: node.label,
                nodeType: node.type,
                variables: node.variables
            }));
            e.dataTransfer.effectAllowed = 'copy';
        });

        // Also list variables underneath for visual context?
        // Requirement: "reveal their variables"
        // Let's ensure variables are listed if expanded? 
        // Re-reading: "Templates expands into Web Apps... each of which further expands to reveal their variables"
        // So the App IS a parent of variables in the sidebar tree.
        
        // Wait, my previous if(node.children) block handles children. 
        // But leaf nodes (Apps) in my data DO NOT have 'children' key, they have 'variables'.
    }
    
    // Handle Variables if present
    if (node.variables) {
         // Create a child container for variables so we can expand/collapse the App too
         const varContainer = document.createElement('div');
         varContainer.className = 'tree-children';
         
         // Make the App expandable
         headerEl.addEventListener('click', () => {
             itemEl.classList.toggle('expanded');
         });
         // Add expand arrow back to leaf if it has variables
         // Actually let's just make sure leaf items initiate as closed
         if (!icon.classList.contains('arrow')) {
             // It was set to leaf icon, let's keep it but maybe add a small chevron or just rely on click
             // To simplify, let's allow clicking the header to toggle variables
         }

         node.variables.forEach(variable => {
             const varEl = document.createElement('div');
             varEl.className = 'tree-item variable-item';
             
             // Variables in sidebar logic:
             // Requirement: "all items and variables should be draggable"
             // Dragging a variable from sidebar? To canvas? 
             // Usually "connect variables" implies connecting visible instances in buckets. 
             // "many-to-many connections between Web App variables and Hub variables" - likely inside canvas.
             // But if I can drag a variable from sidebar, maybe it adds just that variable? 
             // Let's stick to dragging Apps creates Buckets. Dragging variables might just be for show in sidebar or strictly for connection logic if needed later.
             // For now, render them.
             
             const varHeader = document.createElement('div');
             varHeader.className = 'tree-header draggable-source';
             varHeader.innerHTML = `<span class="tree-icon dot" style="width:8px;height:8px;background:var(--primary);border-radius:50%;margin-right:10px;"></span> ${variable.label}`;
             
             // Make variable draggable
             varHeader.setAttribute('draggable', 'true');
             varHeader.addEventListener('dragstart', (e) => {
                 e.dataTransfer.setData('application/json', JSON.stringify({
                     type: 'sidebar-variable',
                     parentId: node.id,
                     ...variable
                 }));
             });

             varEl.appendChild(varHeader);
             varContainer.appendChild(varEl);
         });
         
         itemEl.appendChild(varContainer);
         itemEl.classList.add('has-variables');
    }

    container.appendChild(itemEl);
}
