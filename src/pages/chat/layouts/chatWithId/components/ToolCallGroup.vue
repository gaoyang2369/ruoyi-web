<script setup lang="ts">
import type { ToolCallInfo } from '@/pages/chat/layouts/chatWithId/types';
import ToolCallCard from './ToolCallCard.vue';

const props = defineProps<{
  tools: ToolCallInfo[];
  analysisStatus?: 'analyzing' | 'querying' | 'generating' | 'completed' | 'failed' | 'cancelled';
  analysisStartedAt?: number;
}>();

const isExpanded = ref(false);
const pendingCount = computed(() => props.tools.filter(tool => tool.status === 'pending').length);
const successCount = computed(() => props.tools.filter(tool => tool.status === 'success').length);
const errorCount = computed(() => props.tools.filter(tool => tool.status === 'error').length);
const isFinished = computed(() => pendingCount.value === 0);
function friendlyToolName(name?: string) {
  const names: Record<string, string> = {
    query_device_status: '设备状态查询',
    lookup_fault_code: '故障码查询',
    query_telemetry_statistics: '遥测统计查询',
    query_telemetry_series: '遥测趋势查询',
    diagnose_device: '设备故障诊断',
    generate_operation_report: '运行报告生成',
  };
  return names[name || ''] || name || '分析工具';
}
const elapsedSeconds = computed(() => props.analysisStartedAt
  ? Math.max(1, Math.ceil((Date.now() - props.analysisStartedAt) / 1000))
  : 0);
const latestToolName = computed(() => friendlyToolName(props.tools[props.tools.length - 1]?.name));

const summaryText = computed(() => {
  switch (props.analysisStatus) {
    case 'analyzing': return '正在分析问题';
    case 'querying': return `正在执行${latestToolName.value}`;
    case 'generating': return '数据查询完成，正在生成回答';
    case 'completed': return `分析完成 · 用时 ${elapsedSeconds.value} 秒 · 调用 ${props.tools.length} 项工具`;
    case 'failed': return `分析失败 · 用时 ${elapsedSeconds.value} 秒`;
    case 'cancelled': return `分析已取消 · 用时 ${elapsedSeconds.value} 秒`;
  }
  if (!isFinished.value) {
    return `正在分析 · 使用 ${props.tools.length} 项工具`;
  }
  if (errorCount.value) {
    return `分析完成 · ${successCount.value} 项成功，${errorCount.value} 项异常`;
  }
  return `已完成分析 · 使用 ${props.tools.length} 项工具`;
});
</script>

<template>
  <section class="tool-call-group" :class="{ 'is-finished': isFinished }">
    <button
      class="tool-summary"
      type="button"
      :aria-expanded="isExpanded"
      @click="isExpanded = !isExpanded"
    >
      <span class="summary-status">
        <el-icon v-if="pendingCount" class="is-loading"><Loading /></el-icon>
        <el-icon v-else-if="errorCount" class="status-error"><WarningFilled /></el-icon>
        <el-icon v-else class="status-success"><CircleCheckFilled /></el-icon>
      </span>
      <span>{{ summaryText }}</span>
      <el-icon class="summary-arrow" :class="{ rotated: isExpanded }">
        <ArrowDown />
      </el-icon>
    </button>

    <el-collapse-transition>
      <div v-show="isExpanded" class="tool-call-list">
        <ToolCallCard
          v-for="tool in tools"
          :key="tool.key"
          :tool-info="tool"
        />
      </div>
    </el-collapse-transition>
  </section>
</template>

<style scoped lang="scss">
.tool-call-group {
  width: min(640px, 100%);
  color: #64748b;
  font-size: 13px;

  .tool-summary {
    display: inline-flex;
    gap: 7px;
    align-items: center;
    max-width: 100%;
    padding: 6px 9px;
    color: inherit;
    font: inherit;
    cursor: pointer;
    background: #f7f9fc;
    border: 1px solid #e6ebf2;
    border-radius: 8px;

    &:hover { background: #f1f5f9; }
  }

  .summary-status { display: inline-flex; color: #d89516; }
  .status-success { color: #45a36a; }
  .status-error { color: #d97706; }
  .summary-arrow { margin-left: 2px; transition: transform .2s ease; }
  .summary-arrow.rotated { transform: rotate(180deg); }
  .tool-call-list { margin-top: 6px; }
}
</style>
