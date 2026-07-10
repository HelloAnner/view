const appContext = {{APP_CONTEXT}};
const params = new URLSearchParams(location.search);
let requestedFile = params.get('file') || appContext.initialFile;
let requestedView = params.get('view') === 'source' ? 'source' : 'preview';
let currentPath = null;
let currentPreview = null;
let currentView = requestedView;
let currentVersion = null;
let currentRequestController = null;
let refreshInFlight = false;
let initialHash = readLocationHash();
let toastTimer = 0;
let focusedTreePath = '';
let lastPanelFocus = null;
let activeViewProvider = null;
const viewerStateCache = new Map();

const appEl = document.getElementById('app');
const treeEl = document.getElementById('tree');
const outlineEl = document.getElementById('outline');
const contentEl = document.getElementById('content');
const leftSidebar = document.getElementById('leftSidebar');
const rightSidebar = document.getElementById('rightSidebar');
const treeSearch = document.getElementById('treeSearch');
const resizeHandle = document.getElementById('resizeHandle');
const projectIdentity = document.getElementById('projectIdentity');
const projectName = document.getElementById('projectName');
const explorerBtn = document.getElementById('explorerBtn');
const collapseExplorerBtn = document.getElementById('collapseExplorerBtn');
const fileContextEl = document.getElementById('fileContext');
const viewSwitch = document.getElementById('viewSwitch');
const wrapBtn = document.getElementById('wrapBtn');
const copyContentBtn = document.getElementById('copyContentBtn');
const copyPathBtn = document.getElementById('copyPathBtn');
const outlineBtn = document.getElementById('outlineBtn');
const outlineCloseBtn = document.getElementById('outlineCloseBtn');
const reloadPreviewBtn = document.getElementById('reloadPreviewBtn');
const openExternalBtn = document.getElementById('openExternalBtn');
const panelScrim = document.getElementById('panelScrim');
const refreshState = document.getElementById('refreshState');
const refreshLabel = document.getElementById('refreshLabel');
const toastEl = document.getElementById('toast');

let treeRoot = null;
let ignoreScrollSpy = false;
let outlineRaf = 0;
let searchTimer = 0;
let searchAbortController = null;
const expandedDirs = new Set();
const loadedDirs = new Map();
const SIDEBAR_WIDTH_KEY = 'view-sidebar-width';

const fileIcon = `<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
const folderIcon = `<svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
const arrowIcon = `<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
const imageIcon = `<svg class="image-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
const htmlIcon = `<svg class="html-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="12" x2="16" y2="12"></line><line x1="8" y1="16" x2="12" y2="16"></line></svg>`;
const codeIcon = `<svg class="code-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
const pdfIcon = `<svg class="pdf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M10 13v-1a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1"></path><line x1="10" y1="17" x2="14" y2="17"></line></svg>`;

function treeIcon(type) {
  if (type === 'image') return imageIcon;
  if (type === 'html') return htmlIcon;
  if (type === 'code') return codeIcon;
  if (type === 'pdf') return pdfIcon;
  return fileIcon;
}

projectName.textContent = appContext.rootName || 'view';
projectIdentity.title = appContext.rootPath || '';
appEl.classList.add(`launch-${appContext.launchMode}`);
if (appContext.launchMode === 'file') appEl.classList.add('explorer-hidden');

function normalizeTreePath(value) {
  return !value || value === '.' ? '' : String(value);
}

function readLocationHash() {
  const raw = location.hash.slice(1);
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function updateFileLocation(filePath, hash = '', view = currentView, historyMode = 'replace') {
  const search = new URLSearchParams({ file: filePath });
  const sourceIsOptional = view === 'source' && currentPreview?.fileType !== 'code';
  if (sourceIsOptional || (view === 'source' && !currentPreview)) search.set('view', 'source');
  const suffix = hash ? `#${encodeURIComponent(hash)}` : '';
  const nextUrl = `?${search.toString()}${suffix}`;
  if (historyMode === 'push') history.pushState(null, '', nextUrl);
  if (historyMode === 'replace') history.replaceState(null, '', nextUrl);
}

function setContentMode(mode) {
  contentEl.className = 'content';
  if (mode === 'code') contentEl.classList.add('content--code');
  if (mode === 'fill') contentEl.classList.add('content--fill');
  if (mode === 'media') contentEl.classList.add('content--media');
  appEl.dataset.mode = mode;
}

function setRefreshState(state, label) {
  refreshState.classList.toggle('is-loading', state === 'loading');
  refreshState.classList.toggle('is-error', state === 'error');
  refreshLabel.textContent = label;
}

function setFileContext(filePath, type = 'binary', loading = false) {
  if (!filePath) {
    fileContextEl.innerHTML = '<span class="file-placeholder">No file selected</span>';
    return;
  }
  const title = filePath.split('/').pop() || filePath;
  const folder = directoryName(filePath);
  fileContextEl.innerHTML = `
    <span class="file-context-icon">${treeIcon(type)}</span>
    <span class="file-context-copy">
      <span class="file-name">${escapeHtml(title)}</span>
      <span class="file-path">${escapeHtml(folder === '.' ? appContext.rootName : folder)}</span>
      ${loading ? '<span class="file-path">Loading…</span>' : ''}
    </span>`;
  fileContextEl.title = filePath;
}

function setFileActions(data) {
  const hasFile = Boolean(data?.path || currentPath);
  const isCode = data?.type === 'code';
  const views = Array.isArray(data?.views) ? data.views : [];
  const hasViewSwitch = views.includes('preview') && views.includes('source');
  copyPathBtn.hidden = !hasFile;
  copyContentBtn.hidden = !isCode;
  wrapBtn.hidden = !isCode;
  viewSwitch.hidden = !hasViewSwitch;
  appEl.classList.toggle('has-view-switch', hasViewSwitch);
  viewSwitch.querySelectorAll('.view-option').forEach((button) => {
    const active = button.dataset.view === data?.view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const isLivePreview = data?.view === 'preview' && data?.fileType === 'html';
  reloadPreviewBtn.hidden = !isLivePreview;
  openExternalBtn.hidden = !(data?.view === 'preview' && ['html', 'image', 'pdf'].includes(data?.fileType));
  if (!isCode) wrapBtn.classList.remove('is-active');
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toastEl.classList.remove('is-visible'), 1600);
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  showToast(successMessage);
}

function syncScrim() {
  const explorerOpen = window.innerWidth <= 768 && leftSidebar.classList.contains('open');
  const outlineOpen = window.innerWidth <= 1024 && rightSidebar.classList.contains('open');
  panelScrim.hidden = !(explorerOpen || outlineOpen);
}

function updateExplorerButton() {
  if (appContext.launchMode === 'file') {
    explorerBtn.setAttribute('aria-expanded', 'false');
    explorerBtn.classList.remove('is-active');
    return;
  }
  const expanded = window.innerWidth <= 768
    ? leftSidebar.classList.contains('open')
    : !appEl.classList.contains('explorer-hidden');
  explorerBtn.setAttribute('aria-expanded', String(expanded));
  explorerBtn.classList.toggle('is-active', expanded);
  explorerBtn.setAttribute('aria-label', expanded ? 'Hide file explorer' : 'Show file explorer');
}

function focusableElements(container) {
  return [...container.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.offsetParent !== null);
}

function restorePanelFocus(fallback) {
  const previousIsInsidePanel = leftSidebar.contains(lastPanelFocus) || rightSidebar.contains(lastPanelFocus);
  const target = lastPanelFocus?.isConnected && !previousIsInsidePanel ? lastPanelFocus : fallback;
  lastPanelFocus = null;
  requestAnimationFrame(() => target?.focus());
}

function toggleExplorer(force) {
  if (appContext.launchMode === 'file') return;
  if (window.innerWidth <= 768) {
    const shouldOpen = force ?? !leftSidebar.classList.contains('open');
    if (shouldOpen) lastPanelFocus = leftSidebar.contains(document.activeElement) ? explorerBtn : document.activeElement;
    leftSidebar.classList.toggle('open', shouldOpen);
    rightSidebar.classList.remove('open');
    if (shouldOpen) requestAnimationFrame(() => treeSearch.focus());
    else if (leftSidebar.contains(document.activeElement)) restorePanelFocus(explorerBtn);
  } else {
    const shouldShow = force ?? appEl.classList.contains('explorer-hidden');
    appEl.classList.toggle('explorer-hidden', !shouldShow);
  }
  updateExplorerButton();
  syncScrim();
}

function revealOutlinePanel() {
  if (outlineBtn.hidden) return;
  rightSidebar.classList.remove('is-hidden');
  if (window.innerWidth <= 1024) {
    lastPanelFocus = document.activeElement;
    leftSidebar.classList.remove('open');
    rightSidebar.classList.add('open');
    requestAnimationFrame(() => (outlineEl.querySelector('.outline-node') || outlineCloseBtn).focus());
  }
  outlineBtn.setAttribute('aria-expanded', 'true');
  outlineBtn.classList.add('is-active');
  syncScrim();
}

function closeOutlinePanel(hideOnDesktop = true) {
  const hadFocus = rightSidebar.contains(document.activeElement);
  rightSidebar.classList.remove('open');
  if (hideOnDesktop && window.innerWidth > 1024) rightSidebar.classList.add('is-hidden');
  outlineBtn.setAttribute('aria-expanded', 'false');
  outlineBtn.classList.remove('is-active');
  syncScrim();
  if (hadFocus) restorePanelFocus(outlineBtn);
}

function closeOverlayPanels() {
  const explorerHadFocus = leftSidebar.contains(document.activeElement);
  const outlineHadFocus = rightSidebar.contains(document.activeElement);
  leftSidebar.classList.remove('open');
  rightSidebar.classList.remove('open');
  updateExplorerButton();
  outlineBtn.setAttribute('aria-expanded', 'false');
  syncScrim();
  if (explorerHadFocus || outlineHadFocus) restorePanelFocus(explorerHadFocus ? explorerBtn : outlineBtn);
}

explorerBtn.addEventListener('click', () => toggleExplorer());
collapseExplorerBtn.addEventListener('click', () => toggleExplorer(false));
panelScrim.addEventListener('click', closeOverlayPanels);
outlineBtn.addEventListener('click', () => {
  const isOpen = window.innerWidth <= 1024
    ? rightSidebar.classList.contains('open')
    : !rightSidebar.classList.contains('is-hidden');
  if (isOpen) closeOutlinePanel(); else revealOutlinePanel();
});
outlineCloseBtn.addEventListener('click', () => closeOutlinePanel());
wrapBtn.addEventListener('click', () => activeViewProvider?.toggleWrap?.());
copyPathBtn.addEventListener('click', () => {
  if (currentPath) copyText(currentPath, 'Relative path copied');
});
copyContentBtn.addEventListener('click', () => {
  if (currentPreview?.type === 'code') copyText(currentPreview.content, 'File contents copied');
});
viewSwitch.addEventListener('click', (event) => {
  const button = event.target.closest('.view-option');
  if (!button || !currentPath || button.dataset.view === currentView) return;
  saveCurrentViewerState();
  openFile(currentPath, false, button.dataset.view, '', 'push');
});
reloadPreviewBtn.addEventListener('click', () => {
  const frame = contentEl.querySelector('.html-preview iframe');
  if (!frame) return;
  const url = new URL(frame.src);
  url.searchParams.set('reload', Date.now().toString());
  frame.src = url.toString();
  showToast('Preview reloaded');
});
openExternalBtn.addEventListener('click', () => {
  if (currentPreview?.url) window.open(currentPreview.url, '_blank', 'noopener,noreferrer');
});

updateExplorerButton();

async function loadTree() {
  try {
    treeRoot = await fetchDirectory('');
    renderTree();
    if (requestedFile) {
      await revealFileInTree(requestedFile);
      openFile(requestedFile, false, requestedView, initialHash, 'replace');
    }
  } catch (err) {
    treeEl.innerHTML = `<div class="empty">${escapeHtml(err instanceof Error ? err.message : 'Could not load files')}</div>`;
  }
}

async function fetchDirectory(dirPath) {
  const normalized = normalizeTreePath(dirPath);
  const res = await fetch(`/api/tree?path=${encodeURIComponent(normalized || '.')}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text());
  const node = await res.json();
  loadedDirs.set(normalizeTreePath(node.path), node);
  if (normalizeTreePath(node.path) === '') treeRoot = node;
  return node;
}

function renderTree() {
  const root = loadedDirs.get('') || treeRoot;
  if (!root) return;
  const restoreFocus = treeEl.contains(document.activeElement);
  treeEl.innerHTML = '';
  if (!root.children?.length) {
    treeEl.innerHTML = '<div class="empty">No files</div>';
    return;
  }
  const ul = document.createElement('ul');
  ul.setAttribute('role', 'group');
  for (const child of root.children) {
    ul.appendChild(buildNode(child));
  }
  treeEl.appendChild(ul);
  updateActive(currentPath);
  syncTreeTabStops(restoreFocus);
}

treeSearch?.addEventListener('input', () => {
  const query = treeSearch.value.trim();
  window.clearTimeout(searchTimer);

  if (!query) {
    if (searchAbortController) searchAbortController.abort();
    searchAbortController = null;
    if (currentPath) {
      revealFileInTree(currentPath);
    } else {
      renderTree();
    }
    return;
  }

  treeEl.innerHTML = '<div class="empty">Searching...</div>';
  searchTimer = window.setTimeout(() => searchFiles(query), 180);
});

async function searchFiles(query) {
  if (searchAbortController) searchAbortController.abort();
  searchAbortController = new AbortController();

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      cache: 'no-store',
      signal: searchAbortController.signal,
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (treeSearch.value.trim() !== query) return;
    renderSearchResults(data.results || [], Boolean(data.truncated));
  } catch (err) {
    if (err?.name === 'AbortError') return;
    treeEl.innerHTML = '<div class="empty">Search failed</div>';
  }
}

function renderSearchResults(results, truncated) {
  treeEl.innerHTML = '';
  if (results.length === 0) {
    treeEl.innerHTML = '<div class="empty">No matching files</div>';
    return;
  }

  const ul = document.createElement('ul');
  ul.setAttribute('role', 'group');
  for (const result of results) {
    const li = document.createElement('li');
    li.setAttribute('role', 'none');
    const row = document.createElement('button');
    row.type = 'button';
    const folder = directoryName(result.path);
    row.className = 'tree-node search-result';
    row.dataset.path = result.path;
    row.dataset.type = 'file';
    row.setAttribute('role', 'treeitem');
    row.tabIndex = -1;
    row.innerHTML = `
      ${treeIcon(result.previewType)}
      <span class="tree-result-text">
        <span class="tree-result-name">${escapeHtml(result.name)}</span>
        <span class="tree-result-path">${escapeHtml(folder)}</span>
      </span>`;
    row.addEventListener('click', () => openFile(result.path));
    li.appendChild(row);
    ul.appendChild(li);
  }
  treeEl.appendChild(ul);
  if (truncated) {
    const note = document.createElement('div');
    note.className = 'tree-status';
    note.textContent = 'Showing first 200 matches';
    treeEl.appendChild(note);
  }
  updateActive(currentPath);
  syncTreeTabStops(false);
}

function buildNode(node) {
  const nodePath = normalizeTreePath(node.path);
  const loadedNode = node.type === 'directory' ? (loadedDirs.get(nodePath) || node) : node;
  const li = document.createElement('li');
  li.setAttribute('role', 'none');
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'tree-node';
  row.dataset.path = nodePath;
  row.dataset.type = loadedNode.type;
  row.setAttribute('role', 'treeitem');
  row.tabIndex = -1;

  if (loadedNode.type === 'directory') {
    const isLoaded = loadedDirs.has(nodePath);
    const children = loadedNode.children || [];
    const isExpanded = expandedDirs.has(nodePath);
    const hasChildren = isLoaded ? children.length > 0 : loadedNode.hasChildren !== false;
    row.setAttribute('aria-expanded', String(isExpanded));

    row.innerHTML = `${arrowIcon}${folderIcon}<span>${escapeHtml(loadedNode.name)}</span>`;
    const arrow = row.querySelector('.arrow');
    if (!hasChildren) arrow.style.visibility = 'hidden';
    if (!isExpanded) arrow?.classList.add('collapsed');

    row.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!hasChildren && isLoaded) return;
      await toggleDirectory(nodePath);
    });

    li.appendChild(row);

    if (isExpanded) {
      const childUl = document.createElement('ul');
      childUl.className = 'tree-children';
      childUl.setAttribute('role', 'group');

      if (!isLoaded) {
        const loading = document.createElement('li');
        loading.className = 'tree-status';
        loading.textContent = 'Loading...';
        childUl.appendChild(loading);
      } else if (children.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'tree-status';
        empty.textContent = 'Empty';
        childUl.appendChild(empty);
      } else {
        for (const child of children) {
          childUl.appendChild(buildNode(child));
        }
      }

      li.appendChild(childUl);
    }
  } else {
    row.innerHTML = `<span style="width:14px;flex-shrink:0"></span>${treeIcon(loadedNode.previewType)}<span>${escapeHtml(loadedNode.name)}</span>`;
    row.addEventListener('click', () => openFile(loadedNode.path));
    li.appendChild(row);
  }

  return li;
}

function visibleTreeNodes() {
  return [...treeEl.querySelectorAll('.tree-node')].filter((node) => node.offsetParent !== null);
}

function syncTreeTabStops(restoreFocus = false) {
  const nodes = visibleTreeNodes();
  if (nodes.length === 0) return;
  const preferred = nodes.find((node) => node.dataset.path === focusedTreePath)
    || nodes.find((node) => node.dataset.path === currentPath)
    || nodes[0];
  nodes.forEach((node) => { node.tabIndex = node === preferred ? 0 : -1; });
  if (restoreFocus) requestAnimationFrame(() => preferred.focus());
}

function focusTreeNode(node) {
  if (!node) return;
  visibleTreeNodes().forEach((candidate) => { candidate.tabIndex = candidate === node ? 0 : -1; });
  focusedTreePath = node.dataset.path || '';
  node.focus();
}

treeEl.addEventListener('focusin', (event) => {
  const node = event.target.closest('.tree-node');
  if (node) focusedTreePath = node.dataset.path || '';
});

treeEl.addEventListener('keydown', (event) => {
  const current = event.target.closest('.tree-node');
  if (!current) return;
  const nodes = visibleTreeNodes();
  const index = nodes.indexOf(current);
  let target = null;

  if (event.key === 'ArrowDown') target = nodes[Math.min(index + 1, nodes.length - 1)];
  if (event.key === 'ArrowUp') target = nodes[Math.max(index - 1, 0)];
  if (event.key === 'Home') target = nodes[0];
  if (event.key === 'End') target = nodes[nodes.length - 1];
  if (event.key === 'ArrowRight' && current.dataset.type === 'directory') {
    if (current.getAttribute('aria-expanded') !== 'true') {
      current.click();
    } else {
      target = nodes[index + 1];
    }
  }
  if (event.key === 'ArrowLeft') {
    if (current.dataset.type === 'directory' && current.getAttribute('aria-expanded') === 'true') {
      current.click();
    } else {
      const parentRow = current.closest('li')?.parentElement?.closest('li')?.querySelector(':scope > .tree-node');
      target = parentRow || null;
    }
  }

  if (target || ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if (target) focusTreeNode(target);
  }
});

treeSearch.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    focusTreeNode(visibleTreeNodes()[0]);
  }
});

async function toggleDirectory(dirPath) {
  const normalized = normalizeTreePath(dirPath);
  if (expandedDirs.has(normalized)) {
    expandedDirs.delete(normalized);
    renderTree();
    return;
  }

  expandedDirs.add(normalized);
  renderTree();

  if (!loadedDirs.has(normalized)) {
    try {
      await fetchDirectory(normalized);
    } catch {
      loadedDirs.set(normalized, {
        name: normalized.split('/').pop() || normalized,
        path: normalized,
        type: 'directory',
        children: [],
        hasChildren: false,
        loaded: true,
      });
    }
    if (!treeSearch.value.trim()) renderTree();
  }
}

async function revealFileInTree(filePath) {
  if (!filePath || treeSearch.value.trim()) return;
  const parts = filePath.split('/').filter(Boolean);
  let dirPath = '';

  for (let i = 0; i < parts.length - 1; i++) {
    dirPath = dirPath ? `${dirPath}/${parts[i]}` : parts[i];
    expandedDirs.add(dirPath);
    if (!loadedDirs.has(dirPath)) {
      await fetchDirectory(dirPath);
    }
  }

  renderTree();
}

function directoryName(filePath) {
  const index = filePath.lastIndexOf('/');
  return index >= 0 ? filePath.slice(0, index) : '.';
}

function viewerStateKey(filePath = currentPath, view = currentView) {
  return filePath ? `${filePath}::${view}` : '';
}

function snapshotViewerState() {
  const codeScroll = contentEl.querySelector('.code-scroll');
  return {
    contentTop: contentEl.scrollTop,
    contentLeft: contentEl.scrollLeft,
    codeTop: codeScroll?.scrollTop || 0,
    codeLeft: codeScroll?.scrollLeft || 0,
    hash: readLocationHash(),
    provider: activeViewProvider?.captureState?.() || null,
  };
}

function saveCurrentViewerState() {
  const key = viewerStateKey();
  if (key && currentPreview) viewerStateCache.set(key, snapshotViewerState());
}

function restoreViewerState(state) {
  if (!state) return;
  requestAnimationFrame(() => {
    contentEl.scrollTop = state.contentTop;
    contentEl.scrollLeft = state.contentLeft;
    const codeScroll = contentEl.querySelector('.code-scroll');
    if (codeScroll) {
      codeScroll.scrollTop = state.codeTop;
      codeScroll.scrollLeft = state.codeLeft;
    }
    if (state.hash?.startsWith('L')) activeViewProvider?.revealHash?.(state.hash, false);
    activeViewProvider?.restoreState?.(state.provider);
  });
}

const viewProviders = window.viewProviderRegistry.create({
  buildOutline,
  clearOutline,
  contentEl,
  escapeHtml,
  getCurrentPath: () => currentPath,
  setContentMode,
  showToast,
  updateFileLocation,
  wrapBtn,
});

function renderPreview(data) {
  activeViewProvider?.destroy?.();
  currentPreview = data;
  currentView = data.view || (data.type === 'code' ? 'source' : 'preview');
  currentVersion = data.version;
  setFileContext(data.path, data.fileType || data.type);
  setFileActions(data);
  document.title = `${data.title} — view`;
  activeViewProvider = viewProviders.get(data.type) || viewProviders.get('binary');
  activeViewProvider.render(data);
}

contentEl.addEventListener('click', (event) => {
  const anchor = event.target.closest('.markdown-body a');
  if (!anchor) return;
  const rawHref = anchor.getAttribute('href') || '';

  if (rawHref.startsWith('#')) {
    event.preventDefault();
    const hash = decodeURIComponent(rawHref.slice(1));
    updateFileLocation(currentPath, hash, currentView, 'replace');
    restoreHashScroll(hash);
    return;
  }

  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin || !url.searchParams.has('file')) return;
  event.preventDefault();
  const filePath = url.searchParams.get('file');
  const view = url.searchParams.get('view') === 'source' ? 'source' : 'preview';
  const hash = url.hash ? decodeURIComponent(url.hash.slice(1)) : '';
  openFile(filePath, false, view, hash, 'push');
});

window.addEventListener('popstate', () => {
  const nextParams = new URLSearchParams(location.search);
  const filePath = nextParams.get('file') || appContext.initialFile;
  if (!filePath) return;
  const view = nextParams.get('view') === 'source' ? 'source' : 'preview';
  openFile(filePath, false, view, readLocationHash(), 'none');
});

async function openFile(
  filePath,
  silent = false,
  view = silent ? currentView : 'preview',
  hash = '',
  historyMode = 'push'
) {
  if (!filePath || (silent && refreshInFlight)) return;
  if (silent && currentPath !== filePath) return;

  if (!silent) {
    saveCurrentViewerState();
    currentRequestController?.abort();
    currentPath = filePath;
    currentView = view;
    currentPreview = null;
    currentVersion = null;
    updateActive(filePath);
    updateFileLocation(filePath, hash, view, historyMode);
    setFileContext(filePath, 'binary', true);
    setFileActions({ path: filePath });
    clearOutline();
    setContentMode('document');
    contentEl.innerHTML = '<div class="viewer-loading"><div class="loading-lockup"><span class="spinner"></span><span>Opening file…</span></div></div>';
    setRefreshState('loading', 'Opening');
    if (appContext.launchMode === 'directory' && window.innerWidth <= 768) toggleExplorer(false);
  } else {
    refreshInFlight = true;
    setRefreshState('loading', 'Checking');
  }

  const controller = new AbortController();
  currentRequestController = controller;
  const versionQuery = silent && currentVersion
    ? `&version=${encodeURIComponent(currentVersion)}`
    : '';

  try {
    const res = await fetch(`/api/preview?path=${encodeURIComponent(filePath)}&view=${encodeURIComponent(view)}${versionQuery}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (currentPath !== filePath) return;
    if (res.status === 304) {
      setRefreshState('ready', 'Watching');
      return;
    }
    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    if (currentPath !== filePath) return;
    const viewerState = silent
      ? snapshotViewerState()
      : viewerStateCache.get(viewerStateKey(filePath, data.view));
    renderPreview(data);
    restoreViewerState(viewerState);

    const targetHash = hash || viewerState?.hash || '';
    if (targetHash) restoreHashScroll(targetHash);
    updateFileLocation(filePath, targetHash, currentView, 'replace');
    setRefreshState('ready', silent ? 'Updated' : 'Watching');
    if (silent) window.setTimeout(() => setRefreshState('ready', 'Watching'), 1200);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    setRefreshState('error', silent ? 'Retrying' : 'Failed');
    if (!silent) {
      const message = err instanceof Error ? err.message : 'Could not preview this file';
      setContentMode('document');
      contentEl.innerHTML = `<div class="empty"><h2>Could not preview</h2><p>${escapeHtml(message)}</p></div>`;
    }
  } finally {
    if (currentRequestController === controller) currentRequestController = null;
    if (silent) refreshInFlight = false;
  }
}

function restoreHashScroll(hash = readLocationHash()) {
  if (!hash) return;
  const target = contentEl.querySelector(`[id="${CSS.escape(hash)}"]`);
  if (target) {
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
      if (hash.startsWith('L')) activeViewProvider?.revealHash?.(hash, false);
    });
  }
}

function clearOutline() {
  outlineEl.innerHTML = '<div class="empty">No headings</div>';
  outlineBtn.hidden = true;
  outlineBtn.classList.remove('is-active');
  outlineBtn.setAttribute('aria-expanded', 'false');
  rightSidebar.classList.add('is-hidden');
  rightSidebar.classList.remove('open');
  syncScrim();
}

function buildOutline() {
  outlineEl.innerHTML = '';
  const headings = contentEl.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6');
  if (headings.length === 0) {
    clearOutline();
    return;
  }

  outlineBtn.hidden = false;
  rightSidebar.classList.remove('is-hidden');
  if (window.innerWidth > 1024) {
    outlineBtn.classList.add('is-active');
    outlineBtn.setAttribute('aria-expanded', 'true');
  } else {
    rightSidebar.classList.remove('open');
    outlineBtn.classList.remove('is-active');
    outlineBtn.setAttribute('aria-expanded', 'false');
  }

  const ul = document.createElement('ul');
  for (const h of headings) {
    const level = parseInt(h.tagName[1], 10);
    const text = h.textContent || '';
    const id = h.id;
    const li = document.createElement('li');
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'outline-node';
    node.dataset.level = level;
    node.dataset.target = id;
    node.title = text;
    node.textContent = text;
    node.addEventListener('click', () => {
      outlineEl.querySelectorAll('.outline-node').forEach((el) => {
        el.classList.toggle('active', el === node);
      });
      ignoreScrollSpy = true;
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      h.scrollIntoView({ behavior, block: 'start' });
      if (currentPath) updateFileLocation(currentPath, id);
      setTimeout(() => { ignoreScrollSpy = false; updateOutlineActive(); }, 1200);
    });
    li.appendChild(node);
    ul.appendChild(li);
  }
  outlineEl.appendChild(ul);
  updateOutlineActive();
}

function updateActive(filePath) {
  treeEl.querySelectorAll('.tree-node').forEach((el) => {
    const active = Boolean(filePath) && el.dataset.type === 'file' && el.dataset.path === filePath;
    el.classList.toggle('active', active);
    if (el.dataset.type === 'file') el.setAttribute('aria-selected', String(active));
  });
}

function updateOutlineActive() {
  if (ignoreScrollSpy) return;
  const headings = [...contentEl.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6')];
  if (headings.length === 0) {
    outlineEl.querySelectorAll('.outline-node.active').forEach((el) => el.classList.remove('active'));
    return;
  }

  let currentId = null;
  const nearBottom = contentEl.scrollHeight - contentEl.scrollTop - contentEl.clientHeight < 80;
  const contentRect = contentEl.getBoundingClientRect();

  if (nearBottom) {
    currentId = headings[headings.length - 1].id;
  } else {
    for (const h of headings) {
      const rect = h.getBoundingClientRect();
      if (rect.top - contentRect.top <= 32) {
        currentId = h.id;
      } else {
        break;
      }
    }
  }

  if (!currentId) currentId = headings[0].id;

  outlineEl.querySelectorAll('.outline-node').forEach((el) => {
    el.classList.toggle('active', el.dataset.target === currentId);
  });
}

contentEl.addEventListener('scroll', () => {
  if (outlineRaf) return;
  outlineRaf = window.requestAnimationFrame(() => {
    outlineRaf = 0;
    updateOutlineActive();
  });
}, { passive: true });

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function setSidebarWidth(width) {
  document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
}

document.addEventListener('keydown', (event) => {
  const openPanel = leftSidebar.classList.contains('open')
    ? leftSidebar
    : rightSidebar.classList.contains('open') ? rightSidebar : null;
  if (event.key === 'Tab' && openPanel) {
    const focusables = focusableElements(openPanel);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  if (event.key === 'Escape' && openPanel) closeOverlayPanels();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
    if (appContext.launchMode === 'directory') {
      event.preventDefault();
      toggleExplorer();
    }
  }
  const targetIsEditable = event.target.matches('input, textarea, select, [contenteditable="true"]');
  if (event.key === '/' && !targetIsEditable && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (appContext.launchMode === 'file') return;
    event.preventDefault();
    if (window.innerWidth <= 768 && !leftSidebar.classList.contains('open')) toggleExplorer(true);
    requestAnimationFrame(() => treeSearch.focus());
  }
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 768) leftSidebar.classList.remove('open');
  if (window.innerWidth > 1024) {
    rightSidebar.classList.remove('open');
    if (!outlineBtn.hidden && !rightSidebar.classList.contains('is-hidden')) {
      outlineBtn.classList.add('is-active');
      outlineBtn.setAttribute('aria-expanded', 'true');
    }
  }
  updateExplorerButton();
  syncScrim();
});

// Auto-refresh the current file every 5 seconds to reflect local changes.
setInterval(() => {
  if (currentPath) openFile(currentPath, true, currentView);
}, 5000);

// Restore sidebar width from localStorage.
(function restoreSidebarWidth() {
  const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  if (saved) {
    const width = parseInt(saved, 10);
    if (width >= 180 && width <= window.innerWidth * 0.5) {
      setSidebarWidth(width);
    }
  }
})();

if (appContext.launchMode === 'file') {
  if (requestedFile) openFile(requestedFile, false, requestedView, initialHash, 'replace');
} else {
  loadTree();
}

// Drag to resize left sidebar.
(function setupResize() {
  if (!resizeHandle || appContext.launchMode === 'file') return;
  let startX = 0;
  let startWidth = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = leftSidebar.offsetWidth;
    resizeHandle.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev) => {
      const delta = ev.clientX - startX;
      const newWidth = Math.max(180, Math.min(window.innerWidth * 0.5, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = (ev) => {
      const delta = ev.clientX - startX;
      const newWidth = Math.max(180, Math.min(window.innerWidth * 0.5, startWidth + delta));
      setSidebarWidth(newWidth);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(newWidth));
      resizeHandle.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
})();

// Notify the server when this tab opens/closes so the background process
// can shut down once no tabs are active.
(function setupTabLifecycle() {
  const tabId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const pingIntervalMs = 30 * 1000;
  let closed = false;

  function post(endpoint, body) {
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  }

  function beacon(endpoint, body) {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([JSON.stringify(body)], { type: 'application/json' }));
    } else {
      post(endpoint, body);
    }
  }

  post('/api/open', { tabId });
  const pingTimer = setInterval(() => post('/api/ping', { tabId }), pingIntervalMs);

  window.__viewTabId = tabId;

  function onUnload() {
    if (closed) return;
    closed = true;
    clearInterval(pingTimer);
    beacon('/api/close', { tabId });
  }

  window.addEventListener('beforeunload', onUnload);
  window.addEventListener('pagehide', onUnload);
})();
