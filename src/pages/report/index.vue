<script setup lang="ts">
import type { OperationReportResult, ReportHealthStatus, ReportRecommendation } from '@/api/report';
import { useRoute, useRouter } from 'vue-router';
import { getOperationReport } from '@/api/report';
import ReportStatusTimeline from './components/ReportStatusTimeline.vue';
import ReportTrendChart from './components/ReportTrendChart.vue';

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const errorMessage = ref('');
const report = ref<OperationReportResult | null>(null);
interface ReportChartInstance { resizeForPrint: () => void }
const trendChartRefs = ref<ReportChartInstance[]>([]);
const isPreparingPrint = ref(false);

const oldMetricLabels: Record<string, string> = {
  dcVoltage: '直流电压',
  currentActual: '实际电流',
  speedActual: '实际转速',
  actualPower: '实际功率',
  motorTemp: '电机温度',
  inverterTemp: '变频器温度',
  motorLoadRate: '电机负载率',
  inverterLoadRate: '变频器负载率',
};

const metricLabels = computed(() => {
  const displayNames: Record<string, string> = {};
  for (const item of [...(report.value?.metrics || []), ...(report.value?.trends || [])]) {
    if (item.displayName) {
      displayNames[item.metricName] = item.displayName;
    }
  }

  return { ...oldMetricLabels, ...displayNames };
});

const statusLabels: Record<ReportHealthStatus, string> = {
  NORMAL: '正常',
  ATTENTION: '关注',
  FAULT: '故障',
  UNKNOWN: '未知',
};

const trendPanels = [
  { title: '电机 / 变频器温度', metricNames: ['motorTemp', 'inverterTemp'] },
  { title: '电机 / 变频器负载率', metricNames: ['motorLoadRate', 'inverterLoadRate'] },
  { title: '转速趋势', metricNames: ['speedActual'] },
  { title: '电流趋势', metricNames: ['currentActual'] },
  { title: '功率趋势', metricNames: ['actualPower'] },
  { title: '直流电压趋势', metricNames: ['dcVoltage'] },
];

const visibleEvidence = computed(() => report.value?.evidence.filter(item => item.userVisible) || []);
const executiveSummary = computed(() => report.value?.narrative?.executiveSummary || report.value?.summary.conclusion || '暂无执行摘要。');
const operatingFindings = computed(() => report.value?.narrative?.operatingFindings?.length
  ? report.value.narrative.operatingFindings
  : report.value?.diagnosis.decisionRationale || []);
const anomalyAnalysis = computed(() => report.value?.narrative?.anomalyAnalysis?.length
  ? report.value.narrative.anomalyAnalysis
  : report.value?.diagnosis.decisionRationale || []);
const displayRecommendations = computed(() => report.value?.narrative?.recommendations?.length
  ? report.value.narrative.recommendations
  : report.value?.recommendations || []);
const riskNotice = computed(() => report.value?.narrative?.riskNotice || '');

function metricDisplayName(metricName: string) {
  return metricLabels.value[metricName] || metricName;
}

function recommendationTitle(item: ReportRecommendation) {
  return item.action || item.content || '未提供处理建议';
}

onMounted(async () => {
  window.addEventListener('beforeprint', handleBeforePrint);
  window.addEventListener('afterprint', handleAfterPrint);

  try {
    const reportCode = String(route.params.reportCode || '');
    const response = await getOperationReport(reportCode);
    report.value = response.report;
  }
  catch {
    errorMessage.value = '报告不存在、无访问权限或加载失败。';
  }
  finally {
    loading.value = false;
  }

  if (report.value && route.query.print === '1') {
    await prepareAndPrint();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeprint', handleBeforePrint);
  window.removeEventListener('afterprint', handleAfterPrint);
  document.documentElement.classList.remove('report-print-layout');
});

function formatDate(value: string | null | undefined) {
  return value ? value.replace('T', ' ') : '无';
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '无';
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function unitOf(metricName: string) {
  return report.value?.metricUnits[metricName] || '—';
}

function statusClass(status: ReportHealthStatus) {
  return `status-${status.toLowerCase()}`;
}

function returnToSource() {
  const returnTo = typeof route.query.returnTo === 'string' ? route.query.returnTo : '';
  if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    void router.replace(returnTo);
    return;
  }

  if (window.history.length > 1) {
    router.back();
    return;
  }

  void router.replace({ name: 'chat' });
}

function waitForLayoutFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

async function resizeChartsForCurrentLayout() {
  await nextTick();
  await waitForLayoutFrame();
  trendChartRefs.value.forEach(chart => chart.resizeForPrint());
}

function setPrintLayout(enabled: boolean) {
  document.documentElement.classList.toggle('report-print-layout', enabled);
}

async function prepareAndPrint() {
  if (isPreparingPrint.value) {
    return;
  }
  isPreparingPrint.value = true;
  setPrintLayout(true);
  await resizeChartsForCurrentLayout();
  window.print();
}

function handleBeforePrint() {
  if (isPreparingPrint.value) {
    return;
  }
  setPrintLayout(true);
  void resizeChartsForCurrentLayout();
}

function handleAfterPrint() {
  setPrintLayout(false);
  isPreparingPrint.value = false;
  void resizeChartsForCurrentLayout();
}
</script>

<template>
  <main class="report-page">
    <div v-loading="loading" class="report-loading">
      <el-result v-if="errorMessage" icon="warning" title="无法查看报告" :sub-title="errorMessage">
        <template #extra>
          <el-button @click="returnToSource">
            返回
          </el-button>
        </template>
      </el-result>

      <div v-else-if="report" class="report-sheet">
        <div class="report-actions no-print">
          <el-button @click="returnToSource">
            返回
          </el-button>
          <el-button type="primary" @click="prepareAndPrint">
            导出PDF
          </el-button>
          <span class="print-tip">Firefox/Chrome 打印时请关闭“页眉和页脚”。</span>
        </div>

        <header class="report-header report-print-block">
          <div>
            <p class="report-kicker">
              OPERATION REPORT
            </p>
            <h1>{{ report.asset.deviceName }}运行报告</h1>
            <p class="report-code">
              {{ report.metadata.reportId }}
            </p>
          </div>
          <div class="report-header-meta">
            <span>变频器：{{ report.asset.inverterName || '未提供' }}</span>
            <span>生成时间：{{ formatDate(report.metadata.generatedAt) }}</span>
            <span>分析周期：{{ formatDate(report.period.windowStart) }} 至 {{ formatDate(report.period.windowEnd) }}</span>
          </div>
        </header>

        <section class="status-grid report-print-block">
          <article>
            <span>当前状态</span>
            <strong :class="statusClass(report.currentStatus)">{{ statusLabels[report.currentStatus] }}</strong>
            <small>{{ report.summary.currentStatusConfirmed ? '已由窗口末端数据确认' : '当前状态未确认' }}</small>
          </article>
          <article>
            <span>周期状态</span>
            <strong :class="statusClass(report.periodStatus)">{{ statusLabels[report.periodStatus] }}</strong>
            <small>仅表示整个分析周期内的确定性结论</small>
          </article>
          <article>
            <span>异常代码</span>
            <strong>{{ report.summary.faultCodes.length + report.summary.alarmCodes.length }}</strong>
            <small>故障 {{ report.summary.faultCodes.length }} · 报警 {{ report.summary.alarmCodes.length }}</small>
          </article>
        </section>

        <section class="report-section summary-section report-print-block">
          <div class="section-heading">
            <span>01</span><h2>执行摘要</h2>
          </div>
          <p>{{ executiveSummary }}</p>
          <el-alert
            v-if="report.dataQuality && !report.dataQuality.sufficient"
            type="warning"
            :closable="false"
            title="部分运行数据缺失，本报告中的趋势分析仅供参考。"
          />
          <el-alert
            v-if="report.period.fallbackToLatestData"
            type="warning"
            :closable="false"
            title="请求窗口无数据，本报告使用最近可用历史窗口；当前状态不能据此确认。"
          />
        </section>

        <section class="report-section report-print-block">
          <div class="section-heading report-print-block">
            <span>02</span><h2>运行时间线</h2>
          </div>
          <ReportStatusTimeline
            :window-start="report.period.windowStart" :window-end="report.period.windowEnd"
            :status-timeline="report.statusTimeline" :events="report.events" :current-status="report.currentStatus"
          />
        </section>

        <section class="report-section trend-section">
          <div class="section-heading report-print-block">
            <span>03</span><h2>运行趋势</h2>
          </div>
          <p v-if="report.events.length" class="trend-event-hint report-print-block">
            淡色区域为异常窗口，橙色虚线为触发边界，绿色虚线为恢复边界。
          </p>
          <div class="chart-grid">
            <ReportTrendChart
              v-for="panel in trendPanels" ref="trendChartRefs" :key="panel.title" :title="panel.title"
              :metric-names="panel.metricNames" :metric-labels="metricLabels" :metric-units="report.metricUnits"
              :trends="report.trends" :events="report.events" :window-start="report.period.windowStart"
              :window-end="report.period.windowEnd"
            />
          </div>
          <el-empty v-if="!report.trends.length" description="本报告快照中没有可展示的真实趋势数据" />
          <div v-if="operatingFindings.length" class="operating-findings">
            <h3>运行解读</h3>
            <ul>
              <li v-for="item in operatingFindings" :key="item">
                {{ item }}
              </li>
            </ul>
          </div>
        </section>

        <section class="report-section report-print-block">
          <div class="section-heading">
            <span>04</span><h2>指标明细</h2>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>指标</th><th>单位</th><th>当前</th><th>平均</th><th>最小</th><th>最大</th><th>样本数</th><th>峰值时间</th></tr></thead>
              <tbody>
                <tr v-for="metric in report.metrics" :key="metric.metricName">
                  <td>{{ metric.displayName || metricDisplayName(metric.metricName) }}</td>
                  <td>{{ unitOf(metric.metricName) }}</td>
                  <td>{{ formatNumber(metric.current) }}</td>
                  <td>{{ formatNumber(metric.average) }}</td>
                  <td>{{ formatNumber(metric.minimum) }}</td>
                  <td>{{ formatNumber(metric.maximum) }}</td>
                  <td>{{ metric.count ?? '无' }}</td>
                  <td>{{ formatDate(metric.peakAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="!report.metrics.length" class="empty-copy">
            本报告快照中没有指标统计。
          </p>
        </section>

        <section class="report-section report-print-block">
          <article>
            <div class="section-heading">
              <span>05</span><h2>诊断与异常分析</h2>
            </div>
            <ul v-if="anomalyAnalysis.length">
              <li v-for="item in anomalyAnalysis" :key="item">
                {{ item }}
              </li>
            </ul>
            <p v-else class="empty-copy">
              没有额外诊断判断说明。
            </p>
          </article>
        </section>
        <section class="report-section report-print-block">
          <article>
            <div class="section-heading">
              <span>06</span><h2>处理建议</h2>
            </div>
            <ul v-if="displayRecommendations.length" class="recommendation-list">
              <li v-for="item in displayRecommendations" :key="`${item.priority}-${recommendationTitle(item)}`">
                <div class="recommendation-title">
                  <span v-if="item.priority" class="priority-tag">{{ item.priority }}</span>
                  <strong>{{ recommendationTitle(item) }}</strong>
                </div>
                <ol v-if="item.steps?.length" class="recommendation-steps">
                  <li v-for="step in item.steps" :key="step">
                    {{ step }}
                  </li>
                </ol>
              </li>
            </ul>
            <p v-else class="empty-copy">
              没有结构化处理建议。
            </p>
          </article>
        </section>

        <section class="report-section report-print-block">
          <div class="section-heading">
            <span>07</span><h2>诊断依据</h2>
          </div>
          <ul v-if="visibleEvidence.length" class="evidence-list">
            <li v-for="(item, index) in visibleEvidence" :key="item.evidenceCode || item.evidenceId || index">
              <strong>{{ item.evidenceCode || `EV-${item.evidenceId}` }}</strong>
              <span>{{ item.type || '未分类' }} · {{ item.source || '来源未注明' }}</span>
              <p>{{ item.content || '无摘要' }}</p>
            </li>
          </ul>
          <p v-else class="empty-copy">
            没有可向用户展示的证据条目。
          </p>
        </section>

        <section class="report-section report-print-block">
          <div class="section-heading">
            <span>08</span><h2>结论边界</h2>
          </div>
          <p v-if="riskNotice" class="narrative-copy">
            {{ riskNotice }}
          </p>
          <ul v-else-if="report.limitations.length">
            <li v-for="item in report.limitations" :key="item">
              {{ item }}
            </li>
          </ul>
          <p v-else class="empty-copy">
            当前报告未记录额外局限性。
          </p>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
.report-page {
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  color: #25364a;
  background: #eef2f6;
}

.report-loading {
  min-height: 100%;
}

.report-sheet {
  width: min(1180px, calc(100% - 40px));
  padding: 28px 0 64px;
  margin: 0 auto;
}

.report-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 14px;
  gap: 10px;
}
.print-tip { align-self: center; color: #718095; font-size: 12px; }

.report-header,
.report-section,
.status-grid article {
  background: #fff;
  border: 1px solid #e4eaf1;
  box-shadow: 0 10px 30px rgb(32 57 83 / 6%);
}

.report-header {
  display: flex;
  padding: 34px 38px;
  justify-content: space-between;
  border-top: 5px solid #216a9f;
  border-radius: 16px;
  gap: 32px;
}

.report-kicker {
  margin: 0 0 8px;
  color: #397ba7;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

h1 {
  margin: 0;
  color: #17334d;
  font-size: 30px;
}

.report-code {
  margin: 10px 0 0;
  color: #8290a1;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.report-header-meta {
  display: flex;
  max-width: 520px;
  color: #66768a;
  font-size: 13px;
  line-height: 1.7;
  flex-direction: column;
  justify-content: center;
}

.status-grid {
  display: grid;
  margin-top: 18px;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.status-grid article {
  display: flex;
  min-height: 120px;
  padding: 18px 20px;
  border-radius: 14px;
  flex-direction: column;
}

.status-grid span,
.status-grid small {
  color: #77879a;
}

.status-grid strong {
  margin: 8px 0 5px;
  color: #21374d;
  font-size: 25px;
}

.status-normal { color: #27805f !important; }
.status-attention { color: #b87412 !important; }
.status-fault { color: #c74b4b !important; }
.status-unknown { color: #758195 !important; }

.report-section {
  padding: 26px 30px;
  margin-top: 18px;
  border-radius: 16px;
}

.section-heading {
  display: flex;
  align-items: center;
  margin-bottom: 18px;
  gap: 10px;
}

.section-heading > span {
  color: #7fa7c3;
  font-size: 12px;
  font-weight: 700;
}

h2 {
  margin: 0;
  color: #1d3a53;
  font-size: 19px;
}

.summary-section > p {
  margin: 0 0 16px;
  line-height: 1.85;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.operating-findings { margin-top: 18px; padding-top: 14px; border-top: 1px solid #e7ecf2; }
.operating-findings h3 { margin: 0; }
.trend-event-hint { margin: -8px 0 14px; color: #718095; font-size: 12px; }

.electrical-chart {
  padding: 0;
  background: transparent;
  border: 0;
}

.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 11px 10px; text-align: left; border-bottom: 1px solid #e7ecf2; white-space: nowrap; }
th { color: #526579; font-weight: 600; background: #f5f8fb; }

ul, ol { padding-left: 22px; line-height: 1.8; }
.empty-copy { color: #7b8999; }

.model-narrative {
  padding: 14px 16px;
  margin-top: 16px;
  background: #f7f9fc;
  border-left: 3px solid #79a9c8;
  border-radius: 8px;
}

.model-narrative strong { color: #36546d; font-size: 13px; }
.model-narrative p { margin: 8px 0 0; line-height: 1.75; white-space: pre-wrap; }
.narrative-copy { margin: 0; line-height: 1.8; white-space: pre-wrap; }
.recommendation-list { padding: 0; list-style: none; }
.recommendation-list > li + li { margin-top: 16px; }
.recommendation-title { display: flex; align-items: center; gap: 8px; }
.priority-tag { padding: 1px 7px; color: #8b5c10; font-size: 12px; font-weight: 700; background: #fff5df; border-radius: 999px; }
.recommendation-steps { margin: 7px 0 0; }

.evidence-list { padding: 0; list-style: none; }
.evidence-list li { padding: 13px 0; border-bottom: 1px solid #edf0f4; }
.evidence-list span { margin-left: 10px; color: #718095; font-size: 13px; }
.evidence-list p { margin: 6px 0 0; color: #40566d; }

.print-only { display: none; }

@media screen and (max-width: 900px) {
  .report-sheet { width: calc(100% - 20px); }
  .report-header { padding: 26px 22px; flex-direction: column; }
  .status-grid, .chart-grid { grid-template-columns: 1fr; }
  .status-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>

<style lang="scss">
@page {
  size: A4;
  margin: 12mm;
}

@media print {
  html, body, #app { height: auto !important; overflow: visible !important; background: #fff !important; }
  .layout-header, .aside-container, .no-print { display: none !important; }
  .layout-container, .layout-container-main, .layout-main, .report-page {
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: #fff !important;
  }
  .report-sheet { width: 100% !important; padding: 0 !important; }
  .report-header, .report-section, .status-grid article, .trend-chart {
    border-radius: 2px !important;
    box-shadow: none !important;
  }
  .report-header {
    padding: 16px 18px !important;
    flex-direction: row !important;
  }
  .status-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }
  .status-grid article {
    min-height: 0 !important;
    padding: 10px 12px !important;
  }
  .status-grid strong { font-size: 20px !important; }
  .report-section {
    padding: 14px 16px !important;
    margin-top: 8px !important;
    break-inside: auto;
    page-break-inside: auto;
  }
  .report-header, .status-grid, .status-grid article, tr, .trend-chart, .model-narrative,
  .operating-findings, .evidence-list li, .recommendation-list > li, .el-timeline-item {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  h1, h2, h3, .section-heading {
    break-after: avoid;
    page-break-after: avoid;
  }
  .chart-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
  .trend-chart { break-inside: avoid; page-break-inside: avoid; }
  .trend-chart { padding: 10px !important; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .table-wrap { overflow: visible !important; }
  th, td { padding: 7px 6px !important; }
}

html.report-print-layout .report-page {
  min-width: 0;
  background: #fff;
}

html.report-print-layout .report-sheet {
  width: 186mm !important;
  padding: 0 !important;
}

html.report-print-layout .no-print { display: none !important; }
html.report-print-layout .report-header { padding: 16px 18px !important; flex-direction: row !important; }
html.report-print-layout .status-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 8px !important; }
html.report-print-layout .status-grid article { min-height: 0 !important; padding: 10px 12px !important; }
html.report-print-layout .chart-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
html.report-print-layout .report-section { padding: 14px 16px !important; margin-top: 8px !important; }
html.report-print-layout .trend-chart { padding: 10px !important; }
html.report-print-layout .report-header,
html.report-print-layout .report-section,
html.report-print-layout .status-grid article,
html.report-print-layout .trend-chart {
  border-radius: 2px !important;
  box-shadow: none !important;
}
</style>
