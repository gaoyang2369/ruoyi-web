<script setup lang="ts">
import type { CompletenessCategory, OperationReportResult, ReportHealthStatus } from '@/api/report';
import { useRoute, useRouter } from 'vue-router';
import { getOperationReport } from '@/api/report';
import ReportCompletenessChart from './components/ReportCompletenessChart.vue';
import ReportTrendChart from './components/ReportTrendChart.vue';

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const errorMessage = ref('');
const report = ref<OperationReportResult | null>(null);
const selectedElectricalMetric = ref('');
const selectedCompletenessMetric = ref('');

const metricLabels: Record<string, string> = {
  dcVoltage: '直流电压',
  currentActual: '实际电流',
  speedActual: '实际转速',
  actualPower: '实际功率',
  motorTemp: '电机温度',
  inverterTemp: '变频器温度',
  motorLoadRate: '电机负载率',
  inverterLoadRate: '变频器负载率',
};

const statusLabels: Record<ReportHealthStatus, string> = {
  NORMAL: '正常',
  ATTENTION: '关注',
  FAULT: '故障',
  UNKNOWN: '未知',
};

const electricalMetrics = computed(() => ['currentActual', 'actualPower', 'dcVoltage']
  .filter(name => report.value?.trends.some(trend => trend.metricName === name && trend.points.length)));

const kpiMetrics = computed(() => {
  const preferred = ['actualPower', 'currentActual', 'dcVoltage', 'motorLoadRate', 'motorTemp'];
  return preferred
    .map(name => report.value?.metrics.find(metric => metric.metricName === name))
    .filter((metric): metric is NonNullable<typeof metric> => Boolean(metric && (metric.current ?? metric.average) !== null))
    .slice(0, 4);
});

const selectedCompleteness = computed<CompletenessCategory | null>(() =>
  report.value?.dataCompleteness.find(item => item.categoryName === selectedCompletenessMetric.value)
  || report.value?.dataCompleteness[0]
  || null,
);

const timeline = computed(() => {
  if (!report.value) {
    return [];
  }
  return report.value.events.flatMap((event) => {
    const rows: Array<{ time: string; text: string; kind: string }> = [];
    if (event.firstSeenAt) {
      rows.push({
        time: event.firstSeenAt,
        text: `${event.type === 'ALARM' ? '报警' : '故障'} ${event.code} 触发`,
        kind: event.type,
      });
    }
    if (event.recoveredAt) {
      rows.push({ time: event.recoveredAt, text: `${event.code} 恢复`, kind: 'RECOVERED' });
    }
    return rows;
  }).sort((left, right) => left.time.localeCompare(right.time));
});

const visibleEvidence = computed(() => report.value?.evidence.filter(item => item.userVisible) || []);

onMounted(async () => {
  try {
    const reportCode = String(route.params.reportCode || '');
    const response = await getOperationReport(reportCode);
    report.value = response.report;
    selectedElectricalMetric.value = electricalMetrics.value[0] || '';
    selectedCompletenessMetric.value = response.report.dataCompleteness[0]?.categoryName || '';
    await nextTick();
    if (route.query.print === '1') {
      window.setTimeout(() => window.print(), 700);
    }
  }
  catch {
    errorMessage.value = '报告不存在、无访问权限或加载失败。';
  }
  finally {
    loading.value = false;
  }
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

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? '无' : `${(value * 100).toFixed(1)}%`;
}

function unitOf(metricName: string) {
  return report.value?.metricUnits[metricName] || '—';
}

function statusClass(status: ReportHealthStatus) {
  return `status-${status.toLowerCase()}`;
}

function printReport() {
  window.print();
}
</script>

<template>
  <main class="report-page">
    <div v-loading="loading" class="report-loading">
      <el-result v-if="errorMessage" icon="warning" title="无法查看报告" :sub-title="errorMessage">
        <template #extra>
          <el-button @click="router.back()">
            返回
          </el-button>
        </template>
      </el-result>

      <div v-else-if="report" class="report-sheet">
        <div class="report-actions no-print">
          <el-button @click="router.back()">
            返回
          </el-button>
          <el-button type="primary" @click="printReport">
            导出PDF
          </el-button>
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
            <span>数据完整率</span>
            <strong>{{ formatPercent(report.dataQuality?.completeness) }}</strong>
            <small>有效样本 {{ report.dataQuality?.validRecordCount ?? 0 }} 条</small>
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
          <p>{{ report.summary.conclusion }}</p>
          <div v-if="report.narrative?.executiveSummary" class="model-narrative">
            <strong>运行摘要</strong>
            <p>{{ report.narrative.executiveSummary }}</p>
          </div>
          <el-alert
            v-if="report.period.fallbackToLatestData"
            type="warning"
            :closable="false"
            title="请求窗口无数据，本报告使用最近可用历史窗口；当前状态不能据此确认。"
          />
        </section>

        <section class="report-section report-print-block">
          <div class="section-heading">
            <span>02</span><h2>KPI 与数据质量</h2>
          </div>
          <div class="quality-grid">
            <div>
              <h3 class="quality-title">
                数据质量
              </h3>
              <dl>
                <div><dt>采样记录</dt><dd>{{ report.dataQuality?.rawRecordCount ?? 0 }}</dd></div>
                <div><dt>有效记录</dt><dd>{{ report.dataQuality?.validRecordCount ?? 0 }}</dd></div>
                <div><dt>重复采样</dt><dd>{{ report.dataQuality?.duplicateCount ?? 0 }}</dd></div>
                <div><dt>无效时间记录</dt><dd>{{ report.dataQuality?.invalidTimeCount ?? 0 }}</dd></div>
                <div><dt>采样缺口</dt><dd>{{ report.dataQuality?.gapCount ?? 0 }}</dd></div>
              </dl>
              <div v-if="kpiMetrics.length" class="kpi-grid">
                <article v-for="metric in kpiMetrics" :key="metric.metricName">
                  <span>{{ metricLabels[metric.metricName] || metric.metricName }}</span>
                  <strong>{{ formatNumber(metric.current ?? metric.average) }}</strong>
                  <small v-if="report.metricUnits[metric.metricName]">{{ report.metricUnits[metric.metricName] }}</small>
                </article>
              </div>
            </div>
            <div v-if="selectedCompleteness" class="completeness-panel">
              <el-select v-model="selectedCompletenessMetric" class="no-print" size="small">
                <el-option
                  v-for="item in report.dataCompleteness"
                  :key="item.categoryName"
                  :label="metricLabels[item.categoryName] || item.categoryName"
                  :value="item.categoryName"
                />
              </el-select>
              <p class="print-only completeness-name">
                {{ metricLabels[selectedCompleteness.categoryName] || selectedCompleteness.categoryName }}
              </p>
              <ReportCompletenessChart :category="selectedCompleteness" />
            </div>
          </div>
        </section>

        <section class="report-section">
          <div class="section-heading report-print-block">
            <span>03</span><h2>运行趋势</h2>
          </div>
          <div class="chart-grid">
            <ReportTrendChart
              title="电机 / 变频器温度"
              :metric-names="['motorTemp', 'inverterTemp']"
              :metric-labels="metricLabels"
              :metric-units="report.metricUnits"
              :trends="report.trends"
              :events="report.events"
            />
            <ReportTrendChart
              title="电机 / 变频器负载率"
              :metric-names="['motorLoadRate', 'inverterLoadRate']"
              :metric-labels="metricLabels"
              :metric-units="report.metricUnits"
              :trends="report.trends"
              :events="report.events"
            />
            <ReportTrendChart
              title="转速趋势"
              :metric-names="['speedActual']"
              :metric-labels="metricLabels"
              :metric-units="report.metricUnits"
              :trends="report.trends"
              :events="report.events"
            />
            <article v-if="electricalMetrics.length" class="electrical-chart report-print-block">
              <el-tabs v-model="selectedElectricalMetric">
                <el-tab-pane
                  v-for="metricName in electricalMetrics"
                  :key="metricName"
                  :label="metricLabels[metricName]"
                  :name="metricName"
                />
              </el-tabs>
              <ReportTrendChart
                :title="`${metricLabels[selectedElectricalMetric]}趋势`"
                :metric-names="[selectedElectricalMetric]"
                :metric-labels="metricLabels"
                :metric-units="report.metricUnits"
                :trends="report.trends"
                :events="report.events"
              />
            </article>
            <div v-if="electricalMetrics.length" class="electrical-print-charts print-only">
              <ReportTrendChart
                v-for="metricName in electricalMetrics"
                :key="`print-${metricName}`"
                :title="`${metricLabels[metricName]}趋势`"
                :metric-names="[metricName]"
                :metric-labels="metricLabels"
                :metric-units="report.metricUnits"
                :trends="report.trends"
                :events="report.events"
              />
            </div>
          </div>
          <el-empty v-if="!report.trends.length" description="本报告快照中没有可展示的真实趋势数据" />
        </section>

        <section v-if="report.narrative?.operatingFindings" class="report-section report-print-block">
          <div class="section-heading">
            <span>04</span><h2>运行解读</h2>
          </div>
          <p class="narrative-copy">
            {{ report.narrative.operatingFindings }}
          </p>
        </section>

        <section class="report-section report-print-block">
          <div class="section-heading">
            <span>05</span><h2>异常时间线</h2>
          </div>
          <el-timeline v-if="timeline.length">
            <el-timeline-item
              v-for="item in timeline"
              :key="`${item.time}-${item.text}`"
              :timestamp="formatDate(item.time)"
              :type="item.kind === 'FAULT' ? 'danger' : item.kind === 'ALARM' ? 'warning' : 'success'"
            >
              {{ item.text }}
            </el-timeline-item>
          </el-timeline>
          <p v-else class="empty-copy">
            报告周期内未发现故障或报警事件。
          </p>
        </section>

        <section class="report-section report-print-block">
          <div class="section-heading">
            <span>06</span><h2>指标表</h2>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>指标</th><th>单位</th><th>当前</th><th>平均</th><th>最小</th><th>最大</th><th>样本数</th><th>峰值时间</th></tr></thead>
              <tbody>
                <tr v-for="metric in report.metrics" :key="metric.metricName">
                  <td>{{ metricLabels[metric.metricName] || metric.metricName }}</td>
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

        <section class="report-section two-column report-print-block">
          <article>
            <div class="section-heading">
              <span>07</span><h2>诊断</h2>
            </div>
            <p>诊断状态：{{ report.diagnosis.status }}</p>
            <ul v-if="report.diagnosis.decisionRationale.length">
              <li v-for="item in report.diagnosis.decisionRationale" :key="item">
                {{ item }}
              </li>
            </ul>
            <p v-else class="empty-copy">
              没有额外诊断判断说明。
            </p>
            <div v-if="report.narrative?.anomalyAnalysis" class="model-narrative">
              <strong>异常分析</strong>
              <p>{{ report.narrative.anomalyAnalysis }}</p>
            </div>
          </article>
          <article>
            <div class="section-heading">
              <span>08</span><h2>建议</h2>
            </div>
            <ol v-if="report.narrative?.recommendations.length">
              <li v-for="item in report.narrative.recommendations" :key="`${item.priority}-${item.action}`">
                <strong>{{ item.priority }}</strong> · {{ item.action }}
                <small class="recommendation-basis">依据：{{ item.basis }}</small>
              </li>
            </ol>
            <ol v-else-if="report.recommendations.length">
              <li v-for="item in report.recommendations" :key="item.content">
                {{ item.content }}
              </li>
            </ol>
            <p v-else class="empty-copy">
              没有结构化处理建议。
            </p>
          </article>
        </section>

        <section class="report-section report-print-block">
          <div class="section-heading">
            <span>09</span><h2>证据</h2>
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
          <p class="source-digest">
            来源摘要：{{ report.period.sourceDigest || '无' }}
          </p>
        </section>

        <section class="report-section report-print-block">
          <div class="section-heading">
            <span>10</span><h2>结论边界</h2>
          </div>
          <p v-if="report.narrative?.riskNotice" class="narrative-copy">
            {{ report.narrative.riskNotice }}
          </p>
          <ul v-if="report.limitations.length">
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
  overflow: auto;
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
  grid-template-columns: repeat(4, 1fr);
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

.quality-grid,
.two-column {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 24px;
}

.quality-grid dl {
  display: grid;
  margin: 0;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.quality-title { margin: 0 0 10px; color: #526579; font-size: 14px; }
.kpi-grid { display: grid; margin-top: 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.kpi-grid article { padding: 11px; background: #eef6fb; border-radius: 9px; }
.kpi-grid span, .kpi-grid small { display: block; color: #718095; font-size: 12px; }
.kpi-grid strong { display: block; margin: 5px 0 2px; color: #233c55; font-size: 18px; }

.quality-grid dl > div {
  padding: 15px;
  background: #f7f9fc;
  border-radius: 10px;
}

dt { color: #78889b; font-size: 13px; }
dd { margin: 5px 0 0; color: #233c55; font-size: 20px; font-weight: 700; }

.completeness-panel {
  display: flex;
  align-items: center;
  flex-direction: column;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

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
.empty-copy, .source-digest { color: #7b8999; }
.source-digest { margin-top: 16px; font-size: 12px; overflow-wrap: anywhere; }

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
.recommendation-basis { display: block; margin-top: 4px; color: #718095; }

.evidence-list { padding: 0; list-style: none; }
.evidence-list li { padding: 13px 0; border-bottom: 1px solid #edf0f4; }
.evidence-list span { margin-left: 10px; color: #718095; font-size: 13px; }
.evidence-list p { margin: 6px 0 0; color: #40566d; }

.print-only { display: none; }

@media (max-width: 900px) {
  .report-sheet { width: calc(100% - 20px); }
  .report-header { padding: 26px 22px; flex-direction: column; }
  .status-grid, .chart-grid { grid-template-columns: 1fr; }
  .status-grid { grid-template-columns: repeat(2, 1fr); }
  .quality-grid, .two-column { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
    box-shadow: none !important;
  }
  .report-print-block, .status-grid article, table, tr, h1, h2, h3 {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .report-section { break-before: auto; }
  .chart-grid, .electrical-print-charts { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
  .electrical-chart { display: none !important; }
  .electrical-print-charts { display: grid !important; grid-column: 1 / -1; }
  .trend-chart { break-inside: avoid; page-break-inside: avoid; }
  .trend-chart-canvas { height: 215px !important; }
  .report-section { padding: 16px 18px !important; margin-top: 10px !important; }
  .print-only { display: block !important; }
}
</style>
