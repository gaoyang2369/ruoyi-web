<script setup lang="ts">
import type { ToolCallInfo } from '@/pages/chat/layouts/chatWithId/types';
import ToolCallGroup from './ToolCallGroup.vue';

const props = defineProps<{
  tools: ToolCallInfo[];
  status: 'analyzing' | 'querying' | 'generating' | 'completed' | 'failed' | 'cancelled';
  startedAt?: number;
}>();

const emit = defineEmits<{
  collapse: [];
}>();

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

const latestToolName = computed(() => friendlyToolName(props.tools[props.tools.length - 1]?.name));
const requestState = computed(() => props.status === 'analyzing' ? 'active' : 'done');
const queryState = computed(() => {
  if (!props.tools.length)
    return 'waiting';
  return props.status === 'querying' ? 'active' : 'done';
});
const answerState = computed(() => {
  if (props.status === 'generating')
    return 'active';
  if (['completed', 'failed', 'cancelled'].includes(props.status))
    return 'done';
  return 'waiting';
});
const title = computed(() => {
  if (props.status === 'completed')
    return '本次分析已完成';
  if (props.status === 'failed')
    return '本次分析未完成';
  if (props.status === 'cancelled')
    return '本次分析已取消';
  return '正在分析';
});
</script>

<template>
  <section class="analysis-trace-panel" aria-label="分析轨迹">
    <header class="trace-header">
      <div>
        <div class="trace-eyebrow">
          ANALYSIS TRACE
        </div>
        <h3>{{ title }}</h3>
      </div>
      <el-tooltip content="收起分析轨迹" placement="left">
        <el-button circle text aria-label="收起分析轨迹" @click="emit('collapse')">
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </el-tooltip>
    </header>

    <p class="trace-notice">
      展示已执行的分析步骤与查询进度，不包含模型内部推理。
    </p>

    <ol class="trace-timeline">
      <li :class="requestState">
        <span class="trace-dot"><el-icon v-if="requestState === 'active'" class="is-loading"><Loading /></el-icon><el-icon v-else><CircleCheckFilled /></el-icon></span>
        <div><strong>识别诊断任务</strong><small>正在确认问题范围与设备对象</small></div>
      </li>
      <li :class="queryState">
        <span class="trace-dot"><el-icon v-if="queryState === 'active'" class="is-loading"><Loading /></el-icon><el-icon v-else-if="queryState === 'done'"><CircleCheckFilled /></el-icon><span v-else /></span>
        <div><strong>查询设备数据</strong><small>{{ tools.length ? `已调用 ${tools.length} 项工具${queryState === 'active' ? `，正在执行 ${latestToolName}` : ''}` : '等待需要的数据查询' }}</small></div>
      </li>
      <li :class="answerState">
        <span class="trace-dot"><el-icon v-if="answerState === 'active'" class="is-loading"><Loading /></el-icon><el-icon v-else-if="answerState === 'done'"><CircleCheckFilled /></el-icon><span v-else /></span>
        <div><strong>生成最终回答</strong><small>{{ status === 'generating' ? '正在整理证据并生成面向用户的回答' : status === 'completed' ? '最终回答已生成' : '等待查询结果' }}</small></div>
      </li>
    </ol>

    <div v-if="tools.length" class="trace-tools">
      <div class="trace-tools-title">
        工具执行
      </div>
      <ToolCallGroup
        :tools="tools"
        :analysis-status="status"
        :analysis-started-at="startedAt"
        default-expanded
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.analysis-trace-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 18px 16px;
  color: #34445c;
  background: #fff;
  border: 1px solid #e4eaf3;
  border-radius: 16px;
  box-shadow: 0 12px 32px rgb(63 88 128 / 10%);
  overflow: auto;
}

.trace-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.trace-eyebrow { color: #8a99ae; font-size: 10px; font-weight: 700; letter-spacing: .08em; }
.trace-header h3 { margin: 4px 0 0; color: #283b58; font-size: 16px; }
.trace-notice { margin: 14px 0 18px; color: #7b899d; font-size: 12px; line-height: 1.6; }

.trace-timeline { padding: 0; margin: 0; list-style: none; }
.trace-timeline li { position: relative; display: flex; gap: 10px; min-height: 60px; color: #a7b1c0; }
.trace-timeline li:not(:last-child)::before { position: absolute; top: 23px; left: 9px; width: 1px; height: calc(100% - 8px); background: #e7edf5; content: ''; }
.trace-dot { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; margin-top: 1px; color: #b8c1ce; background: #f2f5f9; border-radius: 50%; flex: 0 0 auto; }
.trace-timeline strong { display: block; color: inherit; font-size: 13px; }
.trace-timeline small { display: block; margin-top: 4px; color: inherit; font-size: 12px; line-height: 1.45; }
.trace-timeline .active { color: #4b78d6; }
.trace-timeline .active .trace-dot { color: #fff; background: #5d87dd; }
.trace-timeline .done { color: #5c718f; }
.trace-timeline .done .trace-dot { color: #48a26e; background: #e9f7ef; }
.trace-tools { padding-top: 6px; border-top: 1px solid #edf1f6; }
.trace-tools-title { margin: 14px 0 8px; color: #52657f; font-size: 12px; font-weight: 600; }
.trace-tools :deep(.tool-call-group) { width: 100%; }
.trace-tools :deep(.tool-summary) { width: 100%; box-sizing: border-box; justify-content: flex-start; }
</style>
