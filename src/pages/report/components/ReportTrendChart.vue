<script setup lang="ts">
import type { ReportEvent, ReportTrend } from '@/api/report';
import * as echarts from 'echarts';

const props = defineProps<{
  title: string;
  metricNames: string[];
  metricLabels: Record<string, string>;
  metricUnits: Record<string, string>;
  trends: ReportTrend[];
  events: ReportEvent[];
}>();

const chartEl = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const selectedTrends = computed(() => props.metricNames
  .map(name => props.trends.find(trend => trend.metricName === name))
  .filter((trend): trend is ReportTrend => Boolean(trend?.points?.length)));

function buildOption(): echarts.EChartsOption {
  const alarmMarks = props.events
    .filter(event => event.type === 'ALARM')
    .flatMap((event) => {
      const marks: Array<Record<string, unknown>> = [];
      if (event.firstSeenAt) {
        marks.push({
          name: `${event.code} 触发`,
          xAxis: event.firstSeenAt,
          lineStyle: { color: '#e6a23c', type: 'dashed' },
          label: { formatter: `${event.code} 触发`, color: '#a76800' },
        });
      }
      if (event.recoveredAt) {
        marks.push({
          name: `${event.code} 恢复`,
          xAxis: event.recoveredAt,
          lineStyle: { color: '#39a275', type: 'dashed' },
          label: { formatter: `${event.code} 恢复`, color: '#277455' },
        });
      }
      return marks;
    });

  return {
    animation: false,
    color: ['#1769aa', '#e07a3f', '#6f52b5'],
    grid: { left: 62, right: 26, top: 54, bottom: 50, containLabel: false },
    legend: { top: 8 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'time',
      axisLabel: { color: '#667085', hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: unitLabel(),
      nameTextStyle: { color: '#667085' },
      axisLabel: { color: '#667085' },
      splitLine: { lineStyle: { color: '#e9eef5' } },
    },
    series: selectedTrends.value.map((trend, index) => ({
      name: `${props.metricLabels[trend.metricName] || trend.metricName}（${props.metricUnits[trend.metricName] || '单位未配置'}）`,
      type: 'line',
      showSymbol: false,
      connectNulls: false,
      data: trend.points.map(point => [point.timestamp, point.value]),
      lineStyle: { width: 2 },
      markLine: index === 0 && alarmMarks.length
        ? { silent: true, symbol: ['none', 'none'], data: alarmMarks }
        : undefined,
    })),
  };
}

function unitLabel() {
  const configuredUnits = selectedTrends.value.map(trend => props.metricUnits[trend.metricName]);
  const uniqueUnits = new Set(configuredUnits.filter((unit): unit is string => Boolean(unit)));
  return configuredUnits.every(Boolean) && uniqueUnits.size === 1
    ? [...uniqueUnits][0]
    : '单位未配置';
}

function renderChart() {
  if (!chartEl.value || !selectedTrends.value.length || chartEl.value.clientWidth <= 0 || chartEl.value.clientHeight <= 0) {
    return;
  }
  chart ||= echarts.init(chartEl.value);
  chart.setOption(buildOption(), true);
  requestAnimationFrame(() => chart?.resize());
}

function resizeAfterPrintLayout() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (chartEl.value && chartEl.value.clientWidth > 0 && chartEl.value.clientHeight > 0)
      chart?.resize();
  }));
}

function beforePrint() {
  // Some browsers dispatch beforeprint before their @media print reflow. Apply the
  // same chart size marker first, then resize on the settled layout.
  document.documentElement.classList.add('report-printing');
  resizeAfterPrintLayout();
}

function afterPrint() {
  document.documentElement.classList.remove('report-printing');
  resizeAfterPrintLayout();
}

onMounted(() => {
  renderChart();
  if (chartEl.value) {
    resizeObserver = new ResizeObserver(resizeAfterPrintLayout);
    resizeObserver.observe(chartEl.value);
  }
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
});

watch(() => [props.metricNames, props.trends, props.events, props.metricUnits], renderChart, { deep: true });

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('beforeprint', beforePrint);
  window.removeEventListener('afterprint', afterPrint);
  chart?.dispose();
});
</script>

<template>
  <article v-if="selectedTrends.length" class="trend-chart report-print-block">
    <h3>{{ title }}</h3>
    <div ref="chartEl" class="trend-chart-canvas" />
  </article>
</template>

<style scoped lang="scss">
.trend-chart {
  padding: 18px;
  background: #fff;
  border: 1px solid #e7ecf2;
  border-radius: 14px;
}

h3 {
  margin: 0 0 4px;
  color: #24364b;
  font-size: 16px;
}

.trend-chart-canvas {
  width: 100%;
  height: 320px;
}

@media print {
  .trend-chart {
    padding: 10px !important;
  }

  .trend-chart-canvas {
    height: 200px !important;
  }
}

:global(html.report-printing .trend-chart) {
  padding: 10px !important;
}

:global(html.report-printing .trend-chart-canvas) {
  height: 200px !important;
}
</style>
