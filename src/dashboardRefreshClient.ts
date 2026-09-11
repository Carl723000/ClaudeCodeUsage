/**
 * Root-independent client controller for replacing provider dashboard data
 * without reloading the complete Webview document. The surrounding Webview
 * script owns the render-specific restore functions referenced here.
 */
export function getDashboardRefreshClientScript(): string {
  return `
var __ccuLastDashboardPatchRevision = 0;
var __ccuRefreshIdentityAttributes = [
  'aria-controls',
  'data-persist',
  'data-session-id',
  'data-dashboard-tab',
  'data-date',
  'data-hour',
  'data-group',
  'data-sortkey',
  'data-metric',
  'data-project-matrix-range',
  'data-project-matrix-view',
  'name'
];
var __ccuFocusableSelector = 'a[href],button,input,select,textarea,summary,[tabindex]';

function ccuRefreshScope(element, panel) {
  var tab = element && element.closest ? element.closest('.tab-content[id]') : null;
  return tab || panel;
}

function ccuRefreshDescriptor(element, panel, allowOwner) {
  if (!element || !panel || !panel.contains(element) || !element.tagName) { return null; }
  if (element.id && element.id.length <= 256) {
    return { kind: 'id', value: element.id };
  }
  var scope = ccuRefreshScope(element, panel);
  var tag = element.tagName.toLowerCase();
  for (var i = 0; i < __ccuRefreshIdentityAttributes.length; i += 1) {
    var attribute = __ccuRefreshIdentityAttributes[i];
    var value = element.getAttribute(attribute);
    if (value === null || value.length > 512) { continue; }
    var matches = Array.prototype.filter.call(scope.getElementsByTagName(tag), function(candidate) {
      return candidate.getAttribute(attribute) === value;
    });
    return {
      kind: 'attribute',
      scopeId: scope.id || 'provider-panel',
      tag: tag,
      attribute: attribute,
      value: value,
      occurrence: Math.max(0, matches.indexOf(element))
    };
  }
  if (allowOwner !== false) {
    var owner = element.parentElement;
    while (owner && owner !== panel) {
      var ownerDescriptor = ccuRefreshDescriptor(owner, panel, false);
      if (ownerDescriptor) {
        var descendants = Array.prototype.slice.call(owner.querySelectorAll(__ccuFocusableSelector));
        var descendantIndex = descendants.indexOf(element);
        if (descendantIndex >= 0) {
          return { kind: 'descendant', owner: ownerDescriptor, focusIndex: descendantIndex };
        }
      }
      owner = owner.parentElement;
    }
  }
  var focusables = Array.prototype.slice.call(scope.querySelectorAll(__ccuFocusableSelector));
  var focusIndex = focusables.indexOf(element);
  return focusIndex < 0 ? null : {
    kind: 'focus-index',
    scopeId: scope.id || 'provider-panel',
    focusIndex: focusIndex
  };
}

function ccuResolveRefreshDescriptor(descriptor, panel) {
  if (!descriptor || !panel) { return null; }
  if (descriptor.kind === 'id') {
    var byId = document.getElementById(descriptor.value);
    return byId && panel.contains(byId) ? byId : null;
  }
  if (descriptor.kind === 'descendant') {
    var owner = ccuResolveRefreshDescriptor(descriptor.owner, panel);
    if (!owner) { return null; }
    return owner.querySelectorAll(__ccuFocusableSelector)[descriptor.focusIndex] || null;
  }
  var scope = descriptor.scopeId === 'provider-panel'
    ? panel
    : document.getElementById(descriptor.scopeId);
  if (!scope || !panel.contains(scope)) { return null; }
  if (descriptor.kind === 'focus-index') {
    return scope.querySelectorAll(__ccuFocusableSelector)[descriptor.focusIndex] || null;
  }
  if (descriptor.kind !== 'attribute') { return null; }
  var matches = Array.prototype.filter.call(scope.getElementsByTagName(descriptor.tag), function(candidate) {
    return candidate.getAttribute(descriptor.attribute) === descriptor.value;
  });
  return matches[descriptor.occurrence] || null;
}

function ccuCaptureRefreshAnchor(panel, focusedDescriptor) {
  var focused = focusedDescriptor ? ccuResolveRefreshDescriptor(focusedDescriptor, panel) : null;
  if (focused) {
    var focusedRect = focused.getBoundingClientRect();
    if (focusedRect.height > 0 && focusedRect.bottom > 0 && focusedRect.top < window.innerHeight) {
      return { descriptor: focusedDescriptor, top: focusedRect.top };
    }
  }
  var activePanel = panel.querySelector('.tab-content.active') || panel;
  var selector = '[id],[aria-controls],[data-persist],[data-date],[data-hour],[data-group]';
  var best = null;
  Array.prototype.forEach.call(activePanel.querySelectorAll(selector), function(candidate) {
    var descriptor = ccuRefreshDescriptor(candidate, panel, false);
    if (!descriptor) { return; }
    var rect = candidate.getBoundingClientRect();
    if (rect.height <= 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) { return; }
    var score = Math.abs(rect.top);
    if (!best || score < best.score) {
      best = { descriptor: descriptor, top: rect.top, score: score };
    }
  });
  return best ? { descriptor: best.descriptor, top: best.top } : null;
}

function ccuCaptureTransientControl(element, panel) {
  if (!element || !element.matches || !element.matches('input,select,textarea')) { return null; }
  var descriptor = ccuRefreshDescriptor(element, panel, true);
  if (!descriptor) { return null; }
  var state = { descriptor: descriptor, value: element.value };
  if (element.matches('input[type="checkbox"],input[type="radio"]')) {
    state.checked = element.checked;
  }
  if (typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
    state.selectionStart = element.selectionStart;
    state.selectionEnd = element.selectionEnd;
  }
  return state;
}

function ccuCaptureRefreshContext(panel) {
  var focused = document.activeElement && panel.contains(document.activeElement)
    ? document.activeElement
    : null;
  var focus = ccuRefreshDescriptor(focused, panel, true);
  var controls = [];
  var seen = [];
  [focused, document.getElementById('optDraft'), document.getElementById('optResolve'),
    document.getElementById('optDistil'), document.getElementById('optAesthetic')]
    .forEach(function(element) {
      if (!element || seen.indexOf(element) !== -1 || !panel.contains(element)) { return; }
      seen.push(element);
      var captured = ccuCaptureTransientControl(element, panel);
      if (captured) { controls.push(captured); }
    });
  return {
    focus: focus,
    anchor: ccuCaptureRefreshAnchor(panel, focus),
    controls: controls,
    scrollY: window.scrollY
  };
}

function ccuRestoreTransientControls(context, panel) {
  (context.controls || []).forEach(function(saved) {
    var control = ccuResolveRefreshDescriptor(saved.descriptor, panel);
    if (!control || !control.matches || !control.matches('input,select,textarea')) { return; }
    control.value = saved.value;
    if (typeof saved.checked === 'boolean') { control.checked = saved.checked; }
    if (
      typeof saved.selectionStart === 'number' &&
      typeof saved.selectionEnd === 'number' &&
      typeof control.setSelectionRange === 'function'
    ) {
      try { control.setSelectionRange(saved.selectionStart, saved.selectionEnd); } catch (e) {}
    }
  });
}

function ccuRestoreRefreshPosition(context, panel) {
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      var anchor = context.anchor
        ? ccuResolveRefreshDescriptor(context.anchor.descriptor, panel)
        : null;
      if (anchor) {
        window.scrollBy(0, anchor.getBoundingClientRect().top - context.anchor.top);
      } else {
        window.scrollTo(0, context.scrollY);
      }
      var focused = ccuResolveRefreshDescriptor(context.focus, panel);
      if (focused && typeof focused.focus === 'function') {
        try { focused.focus({ preventScroll: true }); } catch (e) { focused.focus(); }
      }
      if (anchor) {
        window.scrollBy(0, anchor.getBoundingClientRect().top - context.anchor.top);
      }
      __ccuUiReady = true;
    });
  });
}

function ccuRestoreDashboardUiAfterPatch(context, panel, tab) {
  try { localStorage.setItem('ccu.activeTab', tab); } catch (e) {}
  showTab(tab, true);
  restoreSessionFilter();
  restorePersistedDetails();
  restoreClaudeDrilldownDetails();
  restoreCodexHourlyDetails();
  restoreAdviceEffectivenessState();
  restoreSessionDetails();
  restoreTableSorts(panel);
  restoreChartMetrics(panel);
  initializeChartDrilldowns(panel);
  initializeHourlyOverviewSelections(panel);
  restoreHourlyOverviewSelections(panel);
  initializeStatusRegions(panel);
  restoreCombinedHeatmapConfig();
  restoreProjectMatrixState(panel);
  ccuRestoreTransientControls(context, panel);
  formatOptSettings();
  requestLocalDataInventoryForVisibleSettings();
  ccuRestoreRefreshPosition(context, panel);
}

function ccuApplyDashboardDataPatch(message) {
  var revision = message && message.revision;
  if (!Number.isSafeInteger(revision) || revision <= 0) { return false; }
  if (revision <= __ccuLastDashboardPatchRevision) {
    vscode.postMessage({ command: 'dashboardDataPatchAck', revision: revision, ok: true });
    return true;
  }
  var panel = document.getElementById('provider-panel');
  var valid = panel &&
    (message.provider === 'claude' || message.provider === 'codex') &&
    message.provider === ccuProviderName() &&
    ['today', 'month', 'all', 'sessions', 'projects', 'content', 'branches', 'workflows', 'settings']
      .indexOf(message.tab) !== -1 &&
    typeof message.html === 'string' &&
    message.html.length <= 32 * 1024 * 1024 &&
    !/<script(?:\\s|>)/i.test(message.html) &&
    message.claudeLast30HoursByDay &&
    Object.prototype.toString.call(message.claudeLast30HoursByDay) === '[object Object]';
  if (!valid) {
    vscode.postMessage({ command: 'dashboardDataPatchAck', revision: revision, ok: false });
    return false;
  }
  try {
    var context = ccuCaptureRefreshContext(panel);
    if (__ccuScrollSaveTimer) {
      clearTimeout(__ccuScrollSaveTimer);
      __ccuScrollSaveTimer = 0;
    }
    __ccuScrollDirty = false;
    __ccuUiReady = false;
    panel.innerHTML = message.html;
    __claudeLast30HoursByDay = message.claudeLast30HoursByDay;
    __ccuLastDashboardPatchRevision = revision;
    ccuRestoreDashboardUiAfterPatch(context, panel, message.tab);
    vscode.postMessage({ command: 'dashboardDataPatchAck', revision: revision, ok: true });
    return true;
  } catch (e) {
    __ccuUiReady = true;
    vscode.postMessage({ command: 'dashboardDataPatchAck', revision: revision, ok: false });
    return false;
  }
}
`;
}
