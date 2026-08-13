<script setup lang="ts">
import type { CompletenessCategory } from '@/api/report';
import * as echarts from 'echarts';

const props = defineProps<{ category: CompletenessCategory }>();
const chartEl = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

function renderChart() {
  if (!chartEl.value) {
    return;
  }
  chart ||= echarts.init(chartEl.value);
  const missing = Math.max(0, props.category.expectedCount - props.category.actualCount);
  chart.setOption({
    animation: false,
    tooltip: { trigger: 'item' },
    color: ['#2d7db7', '#e8edf3'],
    series: [{
      type: 'pie',
      radius: ['62%', '82%'],
      avoidLabelOverlap: true,
      label: { show: false },
      data: [
        { name: '有效数据', value: props.category.actualCount },
        { name: '缺失数据', value: missing },
      ],
    }],
    graphic: [{
      type: 'text',
      left: 'center',
      top: '43%',
      style: {
        text: `${(props.category.completeness * 100).toFixed(1)}%`,
        fontSize: 22,
        fontWeight: 700,
        fill: '#24364b',
        textAlign: 'center',
      },
    }],
  }, true);
  resizeForPrint();
}

function resizeForPrint() {
  if (!chartEl.value || !chart) {
    return;
  }
  const { width, height } = chartEl.value.getBoundingClientRect();
  if (width > 0 && height > 0) {
    chart.resize({ width, height });
  }
}

onMounted(() => {
  renderChart();
  if (chartEl.value) {
    resizeObserver = new ResizeObserver(resizeForPrint);
    resizeObserver.observe(chartEl.value);
  }
});
watch(() => props.category, renderChart, { deep: true });
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
});

defineExpose({ resizeForPrint });
</script>

<template>
  <div ref="chartEl" class="completeness-chart" />
</template>

<style scoped>
.completeness-chart {
  width: 100%;
  max-width: 240px;
  aspect-ratio: 12 / 11;
}
</style>
