// Event Bus for reactivity
export const bus = new EventTarget();

export function emit(event, detail) {
    bus.dispatchEvent(new CustomEvent(event, { detail }));
}

export function on(event, callback) {
    bus.addEventListener(event, (e) => callback(e.detail));
}

// Initial State / Schema
const defaultState = {
    templates: {
        id: 'template',
        label: 'Templates',
        type: 'root',
        children: [
            {
                id: 'cat-ecommerce',
                label: 'E-Commerce',
                type: 'category',
                children: [
                    {
                        id: 'app-shopify',
                        label: 'Shopify',
                        type: 'app',
                        variables: [
                            { id: 'v-shop-new-order', label: 'New Order', type: 'trigger' },
                            { id: 'v-shop-cust-update', label: 'Customer Updated', type: 'trigger' },
                            { id: 'v-shop-prod-id', label: 'Product ID', type: 'data' },
                            { id: 'v-shop-total', label: 'Order Total', type: 'data' }
                        ]
                    },
                    {
                        id: 'app-stripe',
                        label: 'Stripe',
                        type: 'app',
                        variables: [
                            { id: 'v-stripe-pay-success', label: 'Payment Success', type: 'trigger' },
                            { id: 'v-stripe-pay-fail', label: 'Payment Failed', type: 'trigger' },
                            { id: 'v-stripe-cust-id', label: 'Customer ID', type: 'data' }
                        ]
                    },
                    {
                        id: 'app-woocommerce',
                        label: 'WooCommerce',
                        type: 'app',
                        variables: [
                            { id: 'v-woo-order', label: 'Order Created', type: 'trigger' },
                            { id: 'v-woo-sku', label: 'SKU', type: 'data' }
                        ]
                    }
                ]
            },
            {
                id: 'cat-crm',
                label: 'CRM & Sales',
                type: 'category',
                children: [
                    {
                        id: 'app-salesforce',
                        label: 'Salesforce',
                        type: 'app',
                        variables: [
                            { id: 'v-sf-lead', label: 'New Lead', type: 'trigger' },
                            { id: 'v-sf-opp-change', label: 'Opportunity Change', type: 'trigger' },
                            { id: 'v-sf-acct-id', label: 'Account ID', type: 'data' }
                        ]
                    },
                    {
                        id: 'app-hubspot',
                        label: 'HubSpot',
                        type: 'app',
                        variables: [
                            { id: 'v-hs-contact', label: 'Contact Created', type: 'trigger' },
                            { id: 'v-hs-deal-stage', label: 'Deal Stage', type: 'data' }
                        ]
                    },
                    {
                        id: 'app-zendesk',
                        label: 'Zendesk',
                        type: 'app',
                        variables: [
                            { id: 'v-zd-ticket', label: 'New Ticket', type: 'trigger' },
                            { id: 'v-zd-priority', label: 'Priority', type: 'data' }
                        ]
                    }
                ]
            },
            {
                id: 'cat-social',
                label: 'Social & Marketing',
                type: 'category',
                children: [
                    {
                        id: 'app-twitter',
                        label: 'X (Twitter)',
                        type: 'app',
                        variables: [
                            { id: 'v-tw-tweet', label: 'New Mention', type: 'trigger' },
                            { id: 'v-tw-text', label: 'Tweet Text', type: 'data' }
                        ]
                    },
                    {
                        id: 'app-instagram',
                        label: 'Instagram',
                        type: 'app',
                        variables: [
                            { id: 'v-ig-media', label: 'New Media', type: 'trigger' },
                            { id: 'v-ig-url', label: 'Media URL', type: 'data' }
                        ]
                    },
                    {
                        id: 'app-mailchimp',
                        label: 'Mailchimp',
                        type: 'app',
                        variables: [
                            { id: 'v-mc-sub', label: 'New Subscriber', type: 'trigger' },
                            { id: 'v-mc-list-id', label: 'List ID', type: 'data' }
                        ]
                    }
                ]
            },
            {
                id: 'cat-dev',
                label: 'Developer Tools',
                type: 'category',
                children: [
                    {
                        id: 'app-github',
                        label: 'GitHub',
                        type: 'app',
                        variables: [
                            { id: 'v-gh-push', label: 'Commit Push', type: 'trigger' },
                            { id: 'v-gh-pr', label: 'New PR', type: 'trigger' },
                            { id: 'v-gh-repo', label: 'Repository', type: 'data' }
                        ]
                    },
                    {
                        id: 'app-jira',
                        label: 'Jira',
                        type: 'app',
                        variables: [
                            { id: 'v-jira-issue', label: 'Issue Updated', type: 'trigger' },
                            { id: 'v-jira-status', label: 'Status', type: 'data' }
                        ]
                    },
                    {
                        id: 'app-aws',
                        label: 'AWS Lambda',
                        type: 'app',
                        variables: [
                            { id: 'v-aws-exec', label: 'Function Executed', type: 'trigger' },
                            { id: 'v-aws-log', label: 'Log Output', type: 'data' }
                        ]
                    }
                ]
            },
            {
                id: 'cat-hubs',
                label: 'Logic Hubs',
                type: 'category',
                children: [
                    {
                        id: 'hub-webhook',
                        label: 'Webhook',
                        type: 'hub',
                        variables: [
                            { id: 'v-wh-payload', label: 'Payload', type: 'data' },
                            { id: 'v-wh-headers', label: 'Headers', type: 'data' }
                        ]
                    },
                    {
                        id: 'hub-scheduler',
                        label: 'Scheduler',
                        type: 'hub',
                        variables: [
                            { id: 'v-sch-time', label: 'Time Trigger', type: 'trigger' },
                            { id: 'v-sch-date', label: 'Current Date', type: 'data' }
                        ]
                    },
                    {
                        id: 'hub-condition',
                        label: 'If/Else',
                        type: 'hub',
                        variables: [
                            { id: 'v-cond-true', label: 'True', type: 'trigger' },
                            { id: 'v-cond-false', label: 'False', type: 'trigger' },
                            { id: 'v-cond-input', label: 'Input Value', type: 'data' }
                        ]
                    },
                    {
                        id: 'hub-delay',
                        label: 'Delay',
                        type: 'hub',
                        variables: [
                            { id: 'v-delay-in', label: 'Start', type: 'trigger' },
                            { id: 'v-delay-out', label: 'End', type: 'trigger' }
                        ]
                    }
                ]
            }
        ]
    },
    buckets: [], 
    connections: [] 
};

// Load state from local storage or use default
let storedState = localStorage.getItem('workflowState');
let loadedData = storedState ? JSON.parse(storedState) : { buckets: [], connections: [] };

export const state = {
    ...defaultState,
    buckets: loadedData.buckets || [],
    connections: loadedData.connections || [] 
};



// Mutation helpers that trigger save
// History State
let historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

function commitHistory() {
    // Clean future if diverted
    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }
    
    // Push current state
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

// Initialize history with loaded state
setTimeout(() => commitHistory(), 100);

export const actions = {
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
            commitHistory(); // Ideally debounce this for text inputs
        }
    },
    removeBucket(id) {
        state.buckets = state.buckets.filter(x => x.id !== id);
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
    
    // History Actions
    undo() {
        if (historyIndex > 0) {
            historyIndex--;
            const snapshot = historyStack[historyIndex];
            state.buckets = JSON.parse(JSON.stringify(snapshot.buckets));
            state.connections = JSON.parse(JSON.stringify(snapshot.connections));
            
            saveState();
            emit('reset', null); // Trigger Full Re-render
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

function saveState() {

    // Connections need to be serialized as IDs
    const serializableConnections = state.connections.map(c => ({
        id: c.id,
        sourceId: c.sourceId, // e.g. "bucketId:itemIdx:varId"
        targetId: c.targetId,
        points: c.points
    }));

    const toSave = {
        buckets: state.buckets,
        connections: serializableConnections
    };
    
    localStorage.setItem('workflowState', JSON.stringify(toSave));
}

// Helper to generate unique instance IDs for items when added
// We'll modify actions.addItemToBucket to add an instanceId if missing

