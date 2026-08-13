<script setup lang="ts">
import type { CompletenessCategory } from '@/api/report';
import * as echarts from 'echarts';

const props = defineProps<{ category: CompletenessCategory }>();
const chartEl = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;

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
}

onMounted(renderChart);
watch(() => props.category, renderChart, { deep: true });
onBeforeUnmount(() => chart?.dispose());
</script>

<template>
  <div ref="chartEl" class="completeness-chart" />
</template>

<style scoped>
.completeness-chart {
  width: 240px;
  height: 220px;
}
</style>
