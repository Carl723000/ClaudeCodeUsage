/**
 * Adds stable, provider-qualified accessible names to every dashboard chart
 * without changing its visual presentation. Labels are derived from the
 * existing localized provider, tab, section, chart, and metric text.
 */
export function getChartAccessibilityClientScript(): string {
  return `
function ccuChartText(element) {
  return element && element.textContent
    ? element.textContent.replace(/\\s+/g, ' ').trim()
    : '';
}

function ccuPushChartLabelPart(parts, value) {
  var normalized = String(value || '').replace(/\\s+/g, ' ').trim();
  if (normalized && parts.indexOf(normalized) === -1) { parts.push(normalized); }
}

function ccuChartProviderLabel() {
  return ccuChartText(document.getElementById('provider-tab-' + ccuProviderName()));
}

function ccuChartTabLabel(element) {
  var panel = element && element.closest
    ? element.closest('.tab-content[role="tabpanel"]')
    : null;
  if (!panel) { return ''; }
  var labelledBy = panel.getAttribute('aria-labelledby');
  return labelledBy ? ccuChartText(document.getElementById(labelledBy)) : '';
}

function ccuChartSectionHeading(element) {
  var section = element && element.closest
    ? element.closest('.hourly-breakdown, .daily-breakdown, .heatmap-panel')
    : null;
  if (!section) { return ''; }
  var heading = section.querySelector(':scope > h2, :scope > h3, :scope > h4, :scope > .section-header h3');
  return ccuChartText(heading);
}

function ccuChartRegionLabel(scroller) {
  var parts = [];
  ccuPushChartLabelPart(parts, ccuChartProviderLabel());
  ccuPushChartLabelPart(parts, ccuChartTabLabel(scroller));
  ccuPushChartLabelPart(parts, ccuChartSectionHeading(scroller));

  var chart = scroller.closest('.composition-chart, .chart-content');
  var ownHeading = chart && chart.classList.contains('composition-chart')
    ? chart.querySelector(':scope > h3, :scope > h4')
    : null;
  ccuPushChartLabelPart(parts, ccuChartText(ownHeading));

  if (!ownHeading) {
    var section = scroller.closest('.hourly-breakdown, .daily-breakdown');
    var activeMetric = section
      ? section.querySelector(':scope > .chart-tabs .chart-tab.active[data-metric]')
      : null;
    ccuPushChartLabelPart(parts, ccuChartText(activeMetric));
  }
  return parts.join(' · ');
}

function ccuHeatmapRegionLabel(heatmap) {
  var parts = [];
  var baseLabel = heatmap.getAttribute('data-chart-base-label');
  if (baseLabel === null) {
    baseLabel = heatmap.getAttribute('aria-label') || '';
    heatmap.setAttribute('data-chart-base-label', baseLabel);
  }
  ccuPushChartLabelPart(parts, ccuChartProviderLabel());
  ccuPushChartLabelPart(parts, ccuChartTabLabel(heatmap));
  ccuPushChartLabelPart(parts, ccuChartSectionHeading(heatmap));
  ccuPushChartLabelPart(parts, baseLabel);
  return parts.join(' · ');
}

function initializeChartRegions(root) {
  var scope = root || document;
  var scrollers = [];
  var heatmaps = [];
  if (scope.matches && scope.matches('.hc-scroll')) { scrollers.push(scope); }
  if (scope.matches && scope.matches('.heatmap-svg')) { heatmaps.push(scope); }
  scope.querySelectorAll('.hc-scroll').forEach(function(scroller) { scrollers.push(scroller); });
  scope.querySelectorAll('.heatmap-svg').forEach(function(heatmap) { heatmaps.push(heatmap); });

  scrollers.forEach(function(scroller) {
    var label = ccuChartRegionLabel(scroller);
    if (!label) { return; }
    scroller.setAttribute('role', 'region');
    scroller.setAttribute('aria-label', label);
    scroller.setAttribute('data-chart-region', 'true');
  });
  heatmaps.forEach(function(heatmap) {
    var label = ccuHeatmapRegionLabel(heatmap);
    if (!label) { return; }
    heatmap.setAttribute('role', 'region');
    heatmap.setAttribute('aria-label', label);
    heatmap.setAttribute('data-chart-region', 'true');
  });
}
`;
}
