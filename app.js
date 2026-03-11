/* ===== TERMINAL HUB v3 ===== */
(function () {
  "use strict";

  // ===== STORAGE =====
  const STORAGE_KEY = "terminalHubV2";
  const _store = (function () {
    try {
      const s = window["local" + "Storage"];
      s.setItem("__t__", "1");
      s.removeItem("__t__");
      return s;
    } catch (_) {
      return null;
    }
  })();

  function getDefault() {
    return { todos: [], sections: [], folders: ["Inbox"] };
  }

  let data = load();

  function load() {
    if (_store) {
      try {
        const raw = _store.getItem(STORAGE_KEY);
        if (raw) {
          const p = JSON.parse(raw);
          if (!p.todos) p.todos = [];
          if (!p.sections) p.sections = [];
          if (!p.folders || p.folders.length === 0) p.folders = ["Inbox"];
          // Ensure all todos have a folder
          p.todos.forEach(t => { if (!t.folder) t.folder = "Inbox"; });
          return p;
        }
      } catch (_) { /* ignore */ }
    }
    return getDefault();
  }

  function save() {
    if (_store) {
      try { _store.setItem(STORAGE_KEY, JSON.stringify(data)); }
      catch (_) { /* ignore */ }
    }
  }

  // ===== UTIL =====
  const $app = document.getElementById("app");
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

  // ===== DATE HELPERS =====
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function tomorrowStr() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function endOfWeekStr() {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 0 : 7 - day;
    d.setDate(d.getDate() + diff);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function nextWeekStr() {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fmtDate(d) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function isOverdue(due) {
    if (!due) return false;
    return due < todayStr();
  }

  function isSoon(due) {
    if (!due) return false;
    const t = todayStr();
    const tm = tomorrowStr();
    return due === t || due === tm;
  }

  function relativeTime(due) {
    if (!due) return "";
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(due + "T00:00:00");
    const diffMs = target - now;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < -1) return Math.abs(diffDays) + "d overdue";
    if (diffDays === -1) return "yesterday";
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "tomorrow";
    if (diffDays <= 7) return "in " + diffDays + "d";
    if (diffDays <= 14) return "in " + Math.ceil(diffDays / 7) + "w";
    return "in " + diffDays + "d";
  }

  function relativeClass(due) {
    if (!due) return "";
    if (isOverdue(due)) return "urgent";
    if (isSoon(due)) return "soon";
    return "";
  }

  // ===== COLOR & ICON PALETTES =====
  const COLORS = [
    { name: "blue", hex: "#3b82f6" },
    { name: "purple", hex: "#a78bfa" },
    { name: "orange", hex: "#f59e0b" },
    { name: "yellow", hex: "#facc15" },
    { name: "red", hex: "#ef4444" },
    { name: "cyan", hex: "#22d3ee" },
    { name: "pink", hex: "#f472b6" },
    { name: "green", hex: "#22c55e" },
    { name: "teal", hex: "#2dd4bf" },
  ];

  const ICONS = ["💰", "🍽️", "💪", "📝", "📊", "🎯", "📚", "🏠", "🎵", "🧘", "🛒", "✈️", "💊", "🐾", "📸", "🔧"];

  // ===== ROUTING =====
  let currentView = "gallery";
  let _todoFilter = "all";
  let _todoFolder = "All";
  let _todoSearch = "";

  function navigate(view) {
    currentView = view;
    render();
  }

  // ===== CLOCK =====
  function clockStr() {
    return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }
  let clockInterval = null;
  function startClock() {
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(() => {
      const el = document.getElementById("clock");
      if (el) el.textContent = clockStr();
    }, 1000);
  }

  // ===== TOAST =====
  let _toastTimer = null;
  function showToast(msg) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
  }

  // ===== RENDER DISPATCHER =====
  function render() {
    if (currentView === "gallery") renderGallery();
    else if (currentView === "todos") renderTodos();
    else if (currentView.startsWith("section:")) renderSection(currentView.split(":")[1]);
  }

  // ===== GALLERY VIEW =====
  function renderGallery() {
    const total = data.todos.length;
    const done = data.todos.filter(t => t.done).length;
    const active = total - done;
    const overdue = data.todos.filter(t => !t.done && isOverdue(t.due)).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    let todoDesc = "Your tasks and due dates";
    if (active > 0) todoDesc = active + " active task" + (active !== 1 ? "s" : "");
    if (overdue > 0) todoDesc += " \u00b7 " + overdue + " overdue";

    let html = `
      <div class="topbar">
        <div class="logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="Terminal Hub Logo">
            <rect x="1" y="1" width="26" height="26" rx="4" stroke="currentColor" stroke-width="1.5"/>
            <path d="M7 10l5 4-5 4" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="14" y1="18" x2="21" y2="18" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span class="logo-text">TerminalHub</span>
        </div>
        <div class="topbar-right">
          <button class="btn-top" id="exportBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
          <button class="btn-top" id="importBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import
          </button>
          <input type="file" id="importFile" accept=".json" style="display:none">
          <span class="topbar-clock" id="clock">${clockStr()}</span>
        </div>
      </div>

      <div class="gallery">
        <div class="card todo-card" data-nav="todos">
          <div class="card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          </div>
          ${active > 0 ? `<span class="card-badge">${active}</span>` : ""}
          <div class="card-title">To-Dos</div>
          <div class="card-desc">${esc(todoDesc)}</div>
          ${total > 0 ? `
            <div class="card-progress">
              <div class="card-progress-bar"><div class="card-progress-fill" style="width:${pct}%"></div></div>
              <div class="card-progress-text">${pct}% complete \u00b7 ${done}/${total}</div>
            </div>
          ` : ""}
        </div>

        ${data.sections.map(s => {
    const linkCount = (s.links || []).length;
    return `
          <div class="card color-${s.color || "blue"}" data-nav="section:${s.id}">
            <div class="card-actions">
              <button class="card-action-btn del" data-delete-section="${s.id}" title="Delete section">\u2715</button>
            </div>
            <div class="card-icon">${s.icon || "\uD83D\uDCC1"}</div>
            ${linkCount > 0 ? `<span class="card-badge">${linkCount}</span>` : ""}
            <div class="card-title">${esc(s.name)}</div>
            <div class="card-desc">${s.description ? esc(s.description) : linkCount + " link" + (linkCount !== 1 ? "s" : "")}</div>
          </div>`;
  }).join("")}

        <div class="card card-add" id="addSectionCard">
          <div class="card-add-icon">+</div>
          <div class="card-add-label">Add Section</div>
        </div>
      </div>
    `;

    $app.innerHTML = html;
    bindGalleryEvents();
  }

  function bindGalleryEvents() {
    document.querySelectorAll("[data-nav]").forEach(el => {
      el.addEventListener("click", e => {
        if (e.target.closest("[data-delete-section]")) return;
        navigate(el.dataset.nav);
      });
    });

    document.querySelectorAll("[data-delete-section]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const id = btn.dataset.deleteSection;
        const sec = data.sections.find(s => s.id === id);
        if (sec && confirm("Delete \"" + sec.name + "\"? This will remove all its links.")) {
          data.sections = data.sections.filter(s => s.id !== id);
          save();
          render();
        }
      });
    });

    document.getElementById("addSectionCard").addEventListener("click", () => showSectionModal(null));
    document.getElementById("exportBtn").addEventListener("click", exportData);
    document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
    document.getElementById("importFile").addEventListener("change", importData);
    startClock();
  }

  // ===== TODO VIEW =====
  function renderTodos() {
    const allTodos = data.todos;
    const total = allTodos.length;
    const done = allTodos.filter(t => t.done).length;
    const active = total - done;
    const overdue = allTodos.filter(t => !t.done && isOverdue(t.due)).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Folder counts
    const folderCounts = {};
    folderCounts["All"] = total;
    data.folders.forEach(f => { folderCounts[f] = 0; });
    allTodos.forEach(t => {
      const f = t.folder || "Inbox";
      folderCounts[f] = (folderCounts[f] || 0) + 1;
    });

    // Filter items
    let items = [...allTodos];

    // Folder filter
    if (_todoFolder !== "All") {
      items = items.filter(t => (t.folder || "Inbox") === _todoFolder);
    }

    // Status filter
    if (_todoFilter === "active") items = items.filter(t => !t.done);
    else if (_todoFilter === "completed") items = items.filter(t => t.done);
    else if (_todoFilter === "overdue") items = items.filter(t => !t.done && isOverdue(t.due));

    // Search filter
    if (_todoSearch) {
      const q = _todoSearch.toLowerCase();
      items = items.filter(t => t.text.toLowerCase().includes(q));
    }

    // Sort: incomplete first, then by due date, then by creation
    items.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const pa = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
      const pb = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
      if (pa !== pb) return pa - pb;
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return b.created - a.created;
    });

    const counts = {
      all: allTodos.length,
      active: active,
      completed: done,
      overdue: overdue,
    };

    let html = `
      ${topbarHTML()}
      <div class="breadcrumb">
        <span class="breadcrumb-link" data-nav="gallery">Home</span>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">To-Dos</span>
      </div>
      <div class="section-view">
        ${total > 0 ? `
          <div class="progress-section">
            <div class="progress-header">
              <span class="progress-label">Progress</span>
              <span class="progress-pct">${pct}%</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div class="progress-stats">
              <span class="progress-stat"><strong>${done}</strong> done</span>
              <span class="progress-stat"><strong>${active}</strong> active</span>
              ${overdue > 0 ? `<span class="progress-stat" style="color:var(--red)"><strong>${overdue}</strong> overdue</span>` : ""}
            </div>
          </div>
        ` : ""}

        <form class="todo-form" id="todoForm">
          <input type="text" id="todoInput" placeholder="What needs to be done?" required>
          <input type="date" id="todoDue" title="Due date">
          <select id="todoPriority">
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
          ${data.folders.length > 1 ? `
            <select id="todoFolderSelect">
              ${data.folders.map(f => `<option value="${esc(f)}" ${f === (_todoFolder !== "All" ? _todoFolder : "Inbox") ? "selected" : ""}>${esc(f)}</option>`).join("")}
            </select>
          ` : ""}
          <button type="submit" class="btn-primary">Add</button>
        </form>

        <div class="quick-dates">
          <button class="quick-date" data-qd="today">Today</button>
          <button class="quick-date" data-qd="tomorrow">Tomorrow</button>
          <button class="quick-date" data-qd="this-week">This week</button>
          <button class="quick-date" data-qd="next-week">Next week</button>
          <button class="quick-date" data-qd="clear">No date</button>
        </div>

        <div class="folder-bar">
          <button class="folder-tab ${_todoFolder === "All" ? "active" : ""}" data-folder="All">
            All <span class="folder-count">${folderCounts["All"]}</span>
          </button>
          ${data.folders.map(f => `
            <button class="folder-tab ${_todoFolder === f ? "active" : ""}" data-folder="${esc(f)}">
              ${esc(f)} <span class="folder-count">${folderCounts[f] || 0}</span>
              ${f !== "Inbox" ? `<span class="folder-delete" data-del-folder="${esc(f)}">\u2715</span>` : ""}
            </button>
          `).join("")}
          <button class="folder-add" id="addFolderBtn" title="New folder">+ Folder</button>
        </div>

        <div class="filter-bar">
          ${["all", "active", "completed", "overdue"].map(f =>
    `<button class="filter-chip ${_todoFilter === f ? "active" : ""}" data-filter="${f}">${f.charAt(0).toUpperCase() + f.slice(1)}${counts[f] > 0 ? " (" + counts[f] + ")" : ""}</button>`
  ).join("")}
          <input type="text" class="todo-search" id="todoSearchInput" placeholder="Search..." value="${esc(_todoSearch)}">
        </div>

        <div class="todo-list" id="todoList">
          ${items.length === 0 ? `<div class="empty"><span class="empty-cursor">></span>No tasks${_todoFilter !== "all" || _todoFolder !== "All" || _todoSearch ? " matching filters" : ""}. Add one above.</div>` : ""}
          ${items.map(t => {
    const rel = relativeTime(t.due);
    const rc = relativeClass(t.due);
    return `
            <div class="todo-item ${t.done ? "completed" : ""}" data-id="${t.id}">
              <div class="todo-check ${t.done ? "done" : ""}" data-toggle="${t.id}"></div>
              <div class="todo-content">
                <div class="todo-text">${esc(t.text)}</div>
                <div class="todo-meta">
                  ${t.due ? `<span class="tag ${!t.done && isOverdue(t.due) ? "tag-overdue" : !t.done && isSoon(t.due) ? "tag-soon" : "tag-due"}">${fmtDate(t.due)}</span>` : ""}
                  ${t.priority === "high" ? "<span class=\"tag tag-high\">\u26A0 HIGH</span>" : ""}
                  ${t.priority === "low" ? "<span class=\"tag tag-low\">LOW</span>" : ""}
                  ${data.folders.length > 1 && t.folder && t.folder !== "Inbox" ? `<span class="tag tag-folder">${esc(t.folder)}</span>` : ""}
                </div>
              </div>
              ${t.due && !t.done ? `<span class="todo-relative ${rc}">${rel}</span>` : ""}
              <button class="todo-delete" data-del="${t.id}" title="Delete">\u2715</button>
            </div>`;
  }).join("")}
        </div>
      </div>

      <div class="kbd-hint">
        <span><kbd>N</kbd> new task</span>
        <span><kbd>/</kbd> search</span>
      </div>
    `;

    $app.innerHTML = html;
    bindTodoEvents();
    startClock();
  }

  function bindTodoEvents() {
    bindBreadcrumb();

    // Quick date buttons
    document.querySelectorAll("[data-qd]").forEach(el => {
      el.addEventListener("click", () => {
        const dateInput = document.getElementById("todoDue");
        const val = el.dataset.qd;
        document.querySelectorAll("[data-qd]").forEach(b => b.classList.remove("active"));

        if (val === "today") { dateInput.value = todayStr(); el.classList.add("active"); }
        else if (val === "tomorrow") { dateInput.value = tomorrowStr(); el.classList.add("active"); }
        else if (val === "this-week") { dateInput.value = endOfWeekStr(); el.classList.add("active"); }
        else if (val === "next-week") { dateInput.value = nextWeekStr(); el.classList.add("active"); }
        else { dateInput.value = ""; }
      });
    });

    // Add task
    document.getElementById("todoForm").addEventListener("submit", e => {
      e.preventDefault();
      const text = document.getElementById("todoInput").value.trim();
      if (!text) return;
      const folderSelect = document.getElementById("todoFolderSelect");
      const folder = folderSelect ? folderSelect.value : (_todoFolder !== "All" ? _todoFolder : "Inbox");
      data.todos.push({
        id: uid(),
        text,
        due: document.getElementById("todoDue").value || null,
        priority: document.getElementById("todoPriority").value,
        done: false,
        created: Date.now(),
        folder: folder,
      });
      save();
      showToast("Task added");
      render();
    });

    // Toggle complete
    document.querySelectorAll("[data-toggle]").forEach(el => {
      el.addEventListener("click", () => {
        const t = data.todos.find(x => x.id === el.dataset.toggle);
        if (t) {
          t.done = !t.done;
          save();
          showToast(t.done ? "Task completed" : "Task reopened");
          render();
        }
      });
    });

    // Delete task
    document.querySelectorAll("[data-del]").forEach(el => {
      el.addEventListener("click", () => {
        data.todos = data.todos.filter(x => x.id !== el.dataset.del);
        save();
        showToast("Task deleted");
        render();
      });
    });

    // Filters
    document.querySelectorAll("[data-filter]").forEach(el => {
      el.addEventListener("click", () => {
        _todoFilter = el.dataset.filter;
        render();
      });
    });

    // Folders
    document.querySelectorAll("[data-folder]").forEach(el => {
      el.addEventListener("click", e => {
        if (e.target.closest("[data-del-folder]")) return;
        _todoFolder = el.dataset.folder;
        render();
      });
    });

    // Delete folder
    document.querySelectorAll("[data-del-folder]").forEach(el => {
      el.addEventListener("click", e => {
        e.stopPropagation();
        const fname = el.dataset.delFolder;
        if (confirm("Delete folder \"" + fname + "\"? Tasks will move to Inbox.")) {
          data.todos.forEach(t => { if (t.folder === fname) t.folder = "Inbox"; });
          data.folders = data.folders.filter(f => f !== fname);
          if (_todoFolder === fname) _todoFolder = "All";
          save();
          render();
        }
      });
    });

    // Add folder
    const addFolderBtn = document.getElementById("addFolderBtn");
    if (addFolderBtn) {
      addFolderBtn.addEventListener("click", () => showFolderModal());
    }

    // Search
    const searchInput = document.getElementById("todoSearchInput");
    if (searchInput) {
      let debounce = null;
      searchInput.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          _todoSearch = searchInput.value;
          // Re-render the list only, not full page to preserve focus
          renderTodoListOnly();
        }, 200);
      });
    }

    // Keyboard shortcuts
    document.addEventListener("keydown", handleTodoKeydown);
  }

  function renderTodoListOnly() {
    // Instead of full re-render (loses focus), just update the list
    // For simplicity, do a full render but re-focus search
    const searchVal = _todoSearch;
    render();
    const si = document.getElementById("todoSearchInput");
    if (si) { si.focus(); si.value = searchVal; si.setSelectionRange(searchVal.length, searchVal.length); }
  }

  function handleTodoKeydown(e) {
    if (currentView !== "todos") return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      const inp = document.getElementById("todoInput");
      if (inp) inp.focus();
    }
    if (e.key === "/") {
      e.preventDefault();
      const si = document.getElementById("todoSearchInput");
      if (si) si.focus();
    }
  }

  // ===== FOLDER MODAL =====
  function showFolderModal() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal modal-sm">
        <h3>New Folder</h3>
        <div class="modal-field">
          <label>Folder name</label>
          <input type="text" id="folderNameInput" placeholder="e.g. Work, Personal, School..." required>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" id="folderCancel">Cancel</button>
          <button class="btn-primary" id="folderSave">Create</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const nameInput = overlay.querySelector("#folderNameInput");
    nameInput.focus();

    function doSave() {
      const name = nameInput.value.trim();
      if (!name) return;
      if (data.folders.includes(name)) {
        showToast("Folder already exists");
        return;
      }
      data.folders.push(name);
      save();
      overlay.remove();
      _todoFolder = name;
      render();
      showToast("Folder created");
    }

    overlay.querySelector("#folderCancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector("#folderSave").addEventListener("click", doSave);
    nameInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); doSave(); } });
  }

  // ===== CUSTOM SECTION VIEW =====
  function renderSection(sectionId) {
    const sec = data.sections.find(s => s.id === sectionId);
    if (!sec) { navigate("gallery"); return; }

    const links = sec.links || [];

    let html = `
      ${topbarHTML()}
      <div class="breadcrumb">
        <span class="breadcrumb-link" data-nav="gallery">Home</span>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">${esc(sec.name)}</span>
      </div>
      <div class="section-view">
        <div class="section-header">
          <div class="section-title" style="display:flex;align-items:center;gap:var(--sp-3)">
            <span style="font-size:1.3rem">${sec.icon || "\uD83D\uDCC1"}</span>
            ${esc(sec.name)}
          </div>
          <div class="section-actions">
            <button class="btn-top" id="editSectionBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
          </div>
        </div>

        ${sec.description ? `<p style="font-family:var(--font-mono);font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-6)">${esc(sec.description)}</p>` : ""}

        <form class="add-link-form" id="linkForm">
          <input type="text" id="linkPath" placeholder="File path or URL..." required>
          <input type="text" id="linkLabel" placeholder="Label (optional)">
          <button type="submit" class="btn-primary">Add Link</button>
        </form>

        <div class="links-list" id="linkList">
          ${links.length === 0 ? '<div class="empty"><span class="empty-cursor">></span>No links yet. Add a file path or URL above.</div>' : ""}
          ${links.map(l => `
            <div class="link-item" data-id="${l.id}">
              <div class="link-icon">${getLinkIcon(l.path)}</div>
              <div class="link-content">
                <div class="link-label">${esc(l.label || l.path)}</div>
                ${l.label ? `<div class="link-path">${esc(l.path)}</div>` : ""}
              </div>
              <button class="link-delete" data-del-link="${l.id}" title="Remove">\u2715</button>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    $app.innerHTML = html;
    bindSectionEvents(sectionId);
    startClock();
  }

  function getLinkIcon(path) {
    if (!path) return "\uD83D\uDD17";
    const p = path.toLowerCase();
    if (p.includes("http://") || p.includes("https://")) return "\uD83C\uDF10";
    if (p.endsWith(".xlsx") || p.endsWith(".xls") || p.endsWith(".csv")) return "\uD83D\uDCCA";
    if (p.endsWith(".pdf")) return "\uD83D\uDCC4";
    if (p.endsWith(".doc") || p.endsWith(".docx")) return "\uD83D\uDCDD";
    if (p.endsWith(".ppt") || p.endsWith(".pptx")) return "\uD83D\uDCFD\uFE0F";
    if (p.endsWith(".jpg") || p.endsWith(".png") || p.endsWith(".gif")) return "\uD83D\uDDBC\uFE0F";
    if (p.endsWith(".mp4") || p.endsWith(".mov")) return "\uD83C\uDFAC";
    if (p.endsWith(".mp3") || p.endsWith(".wav")) return "\uD83C\uDFB5";
    if (p.endsWith(".zip") || p.endsWith(".rar")) return "\uD83D\uDCE6";
    if (p.endsWith(".py") || p.endsWith(".js") || p.endsWith(".ts")) return "\uD83D\uDCBB";
    return "\uD83D\uDCC1";
  }

  function bindSectionEvents(sectionId) {
    bindBreadcrumb();
    const sec = data.sections.find(s => s.id === sectionId);
    if (!sec) return;

    document.getElementById("linkForm").addEventListener("submit", e => {
      e.preventDefault();
      const path = document.getElementById("linkPath").value.trim();
      if (!path) return;
      const label = document.getElementById("linkLabel").value.trim();
      if (!sec.links) sec.links = [];
      sec.links.push({ id: uid(), path, label: label || "" });
      save();
      showToast("Link added");
      render();
    });

    document.querySelectorAll("[data-del-link]").forEach(el => {
      el.addEventListener("click", () => {
        sec.links = (sec.links || []).filter(l => l.id !== el.dataset.delLink);
        save();
        showToast("Link removed");
        render();
      });
    });

    document.getElementById("editSectionBtn").addEventListener("click", () => {
      showSectionModal(sectionId);
    });
  }

  // ===== SHARED UI =====
  function topbarHTML() {
    return `
      <div class="topbar">
        <div class="logo" style="cursor:pointer" data-nav="gallery">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="Terminal Hub Logo">
            <rect x="1" y="1" width="26" height="26" rx="4" stroke="currentColor" stroke-width="1.5"/>
            <path d="M7 10l5 4-5 4" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="14" y1="18" x2="21" y2="18" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span class="logo-text">TerminalHub</span>
        </div>
        <div class="topbar-right">
          <span class="topbar-clock" id="clock">${clockStr()}</span>
        </div>
      </div>
    `;
  }

  function bindBreadcrumb() {
    document.querySelectorAll("[data-nav]").forEach(el => {
      el.addEventListener("click", e => {
        if (e.target.closest("[data-delete-section]")) return;
        document.removeEventListener("keydown", handleTodoKeydown);
        navigate(el.dataset.nav);
      });
    });
  }

  // ===== SECTION MODAL =====
  function showSectionModal(editId) {
    const existing = editId ? data.sections.find(s => s.id === editId) : null;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h3>${existing ? "Edit Section" : "New Section"}</h3>
        <div class="modal-field">
          <label>Name</label>
          <input type="text" id="secName" value="${existing ? esc(existing.name) : ""}" placeholder="e.g. Finance, Fitness, Meals..." required>
        </div>
        <div class="modal-field">
          <label>Description (optional)</label>
          <textarea id="secDesc" placeholder="What is this section for?">${existing && existing.description ? esc(existing.description) : ""}</textarea>
        </div>
        <div class="modal-field">
          <label>Icon</label>
          <div class="modal-icons" id="iconPicker">
            ${ICONS.map(ic => `<div class="icon-option ${existing && existing.icon === ic ? "active" : ""}" data-icon="${ic}">${ic}</div>`).join("")}
          </div>
        </div>
        <div class="modal-field">
          <label>Color</label>
          <div class="modal-colors" id="colorPicker">
            ${COLORS.map(c => `<div class="color-dot ${existing && existing.color === c.name ? "active" : ""}" data-color="${c.name}" style="background:${c.hex}"></div>`).join("")}
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" id="modalCancel">Cancel</button>
          <button class="btn-primary" id="modalSave">${existing ? "Save" : "Create"}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    let selectedIcon = existing ? existing.icon : ICONS[0];
    let selectedColor = existing ? existing.color : COLORS[0].name;

    if (!existing) {
      overlay.querySelector("[data-icon=\"" + ICONS[0] + "\"]").classList.add("active");
      overlay.querySelector("[data-color=\"" + COLORS[0].name + "\"]").classList.add("active");
    }

    overlay.querySelectorAll(".icon-option").forEach(el => {
      el.addEventListener("click", () => {
        overlay.querySelectorAll(".icon-option").forEach(x => x.classList.remove("active"));
        el.classList.add("active");
        selectedIcon = el.dataset.icon;
      });
    });

    overlay.querySelectorAll(".color-dot").forEach(el => {
      el.addEventListener("click", () => {
        overlay.querySelectorAll(".color-dot").forEach(x => x.classList.remove("active"));
        el.classList.add("active");
        selectedColor = el.dataset.color;
      });
    });

    overlay.querySelector("#modalCancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#modalSave").addEventListener("click", () => {
      const name = overlay.querySelector("#secName").value.trim();
      if (!name) return;
      const desc = overlay.querySelector("#secDesc").value.trim();

      if (existing) {
        existing.name = name;
        existing.description = desc;
        existing.icon = selectedIcon;
        existing.color = selectedColor;
      } else {
        data.sections.push({
          id: uid(),
          name,
          description: desc,
          icon: selectedIcon,
          color: selectedColor,
          links: [],
        });
      }

      save();
      overlay.remove();
      render();
    });

    overlay.querySelector("#secName").focus();
  }

  // ===== EXPORT / IMPORT =====
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "terminalhub-" + new Date().toISOString().split("T")[0] + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Data exported");
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!imported.todos) imported.todos = [];
        if (!imported.sections) imported.sections = [];
        if (!imported.folders) imported.folders = ["Inbox"];
        imported.todos.forEach(t => { if (!t.folder) t.folder = "Inbox"; });
        data = imported;
        save();
        showToast("Data imported");
        navigate("gallery");
      } catch (_) {
        showToast("Invalid JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ===== INIT =====
  render();

  // Update relative times every minute
  setInterval(() => {
    if (currentView === "todos") {
      document.querySelectorAll(".todo-relative").forEach((el, i) => {
        const item = document.querySelectorAll(".todo-item")[i];
        if (item) {
          const id = item.dataset.id;
          const todo = data.todos.find(t => t.id === id);
          if (todo && todo.due && !todo.done) {
            el.textContent = relativeTime(todo.due);
          }
        }
      });
    }
  }, 60000);
})();
