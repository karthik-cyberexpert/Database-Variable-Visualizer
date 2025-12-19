# AI Development Rules for Workflow Editor

This project is built using a minimal, Vanilla JavaScript approach, relying heavily on native browser APIs for performance and simplicity. All new features and modifications must adhere to the existing architectural patterns.

## 🛠️ Tech Stack Overview

1.  **Core Language:** Vanilla JavaScript (ES6+ modules).
2.  **UI Framework:** None. All rendering and interactivity rely on direct DOM manipulation.
3.  **Styling:** Pure CSS (`style.css`) utilizing CSS variables for design tokens (colors, spacing, effects).
4.  **State Management:** Custom implementation using `EventTarget` (`bus`) for reactivity and `localStorage` for persistence (`js/state.js`).
5.  **Graphics:** SVG is used exclusively for drawing dynamic connections (Bezier curves) on the canvas.
6.  **Interactivity:** Custom mouse event listeners handle dragging (buckets, detail cards) and connection drawing.
7.  **Data Structure:** Hierarchical JSON objects for the sidebar templates, and flat arrays for canvas elements (buckets) and connections.

## 📚 Library and Convention Rules

### 1. Core Architecture
*   **Frameworks:** **DO NOT** introduce any external UI frameworks (React, Vue, Angular, etc.). Maintain the Vanilla JS architecture.
*   **DOM Manipulation:** Use standard DOM methods (`document.createElement`, `appendChild`, `addEventListener`, etc.).

### 2. State Management
*   **Mandatory:** All application state mutations (adding/removing buckets, connections, or items) **MUST** be performed using the `actions` object defined in `js/state.js` to ensure history tracking (`commitHistory`) and persistence (`saveState`).
*   **Reactivity:** Use `emit` and `on` from `js/state.js` to handle cross-module communication and re-rendering triggered by state changes (e.g., `reset` for undo/redo).

### 3. Styling and UI
*   **CSS:** **DO NOT** introduce external CSS frameworks (Tailwind CSS, Bootstrap, etc.). Use the existing classes and CSS variables defined in `style.css`.
*   **Icons:** Continue using simple SVG paths embedded directly in JavaScript strings or Unicode/Emoji characters for icons.

### 4. Connections and Canvas
*   **Connection Logic:** Use the functions provided in `js/connections.js` and the detail view logic in `js/main.js` (`getBezierPath`, `updateConnections`, `renderConnection`) for all line drawing.
*   **Coordinates:** Ensure all canvas element positioning (`x`, `y`) is stored in the state relative to the canvas container's top-left corner.