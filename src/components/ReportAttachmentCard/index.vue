<script setup lang="ts">
import type { ReportAttachment, ReportHealthStatus } from '@/api/report';
import { useRoute, useRouter } from 'vue-router';

const props = defineProps<{
  report: ReportAttachment;
}>();

const router = useRouter();
const route = useRoute();

const statusText: Record<ReportHealthStatus, string> = {
  NORMAL: '正常',
  ATTENTION: '关注',
  FAULT: '故障',
  UNKNOWN: '未知',
};

function reportLocation(print = false) {
  return router.resolve({
    name: 'operationReport',
    params: { reportCode: props.report.reportCode },
    query: {
      returnTo: route.fullPath,
      ...(print ? { print: '1' } : {}),
    },
  }).href;
}

function viewReport() {
  window.open(reportLocation(), '_blank', 'noopener,noreferrer');
}

function printReport() {
  window.open(reportLocation(true), '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <section class="report-attachment-card">
    <div class="report-icon">
      <el-icon><Document /></el-icon>
    </div>
    <div class="report-body">
      <div class="report-title-row">
        <strong>{{ report.title }}</strong>
        <span class="report-state">{{ report.reportStatus === 'COMPLETED' ? '已生成' : report.reportStatus }}</span>
      </div>
      <div class="report-meta">
        <span>{{ report.deviceName }}</span>
        <span>{{ report.windowStart }} 至 {{ report.windowEnd }}</span>
      </div>
      <div class="report-statuses">
        <span>当前状态：{{ statusText[report.currentStatus] }}</span>
        <span>周期状态：{{ statusText[report.periodStatus] }}</span>
        <span>数据完整率：{{ (report.dataCompleteness * 100).toFixed(1) }}%</span>
      </div>
      <div class="report-actions">
        <el-button type="primary" size="small" @click="viewReport">
          查看报告
        </el-button>
        <el-button size="small" @click="printReport">
          导出PDF
        </el-button>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.report-attachment-card {
  display: flex;
  width: min(680px, 100%);
  padding: 16px;
  margin-top: 12px;
  color: #26364d;
  background: linear-gradient(135deg, #f8fbff 0%, #f3f7fc 100%);
  border: 1px solid #dce7f3;
  border-radius: 14px;
  box-shadow: 0 8px 24px rgb(44 84 126 / 8%);
  gap: 14px;
}

.report-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  color: #1769aa;
  font-size: 22px;
  background: #e4f1fc;
  border-radius: 12px;
  place-items: center;
}

.report-body {
  min-width: 0;
  flex: 1;
}

.report-title-row,
.report-meta,
.report-statuses,
.report-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.report-title-row {
  font-size: 16px;
}

.report-state {
  padding: 2px 8px;
  color: #1a7f5a;
  font-size: 12px;
  background: #e5f6ef;
  border-radius: 999px;
}

.report-meta,
.report-statuses {
  margin-top: 7px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.report-actions {
  margin-top: 14px;
}
</style>
