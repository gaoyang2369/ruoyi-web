export type ReportHealthStatus = 'NORMAL' | 'ATTENTION' | 'FAULT' | 'UNKNOWN';

export interface ReportAttachment {
  reportCode: string;
  title: string;
  deviceName: string;
  inverterName?: string;
  windowStart: string;
  windowEnd: string;
  reportStatus: string;
  currentStatus: ReportHealthStatus;
  periodStatus: ReportHealthStatus;
  dataCompleteness: number;
}

export interface ReportMetric {
  metricName: string;
  displayName?: string | null;
  current: number | null;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  count: number | null;
  peakAt: string | null;
}

export interface ReportTrendPoint {
  timestamp: string;
  value: number | null;
  count: number;
}

export interface ReportTrend {
  metricName: string;
  displayName?: string | null;
  points: ReportTrendPoint[];
}

export interface ReportEvent {
  code: string;
  type: 'FAULT' | 'ALARM';
  active: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  recoveredAt: string | null;
  sampleHitCount: number;
}

export interface StatusTimelineEvent {
  observedAt: string | null;
  status: string | null;
  faultCode: string | null;
  alarmCode: string | null;
}

export interface CompletenessCategory {
  categoryName: string;
  expectedCount: number;
  actualCount: number;
  completeness: number;
}

export interface OperationReportResult {
  metadata: { reportId: string; generatedAt: string; reportType: string };
  asset: { deviceName: string; inverterName: string | null };
  period: {
    windowStart: string;
    windowEnd: string;
    analysisWindowStart: string | null;
    analysisWindowEnd: string | null;
    fallbackToLatestData: boolean;
    latestObservedAt: string | null;
    sourceDigest: string | null;
  };
  periodStatus: ReportHealthStatus;
  currentStatus: ReportHealthStatus;
  summary: {
    conclusion: string;
    faultCodes: string[];
    alarmCodes: string[];
    currentStatusConfirmed: boolean;
  };
  dataQuality: {
    rawRecordCount: number;
    validRecordCount: number;
    duplicateCount: number;
    invalidTimeCount: number;
    gapCount: number;
    completeness: number;
    sufficient: boolean;
  } | null;
  metricUnits: Record<string, string>;
  dataCompleteness: CompletenessCategory[];
  metrics: ReportMetric[];
  trends: ReportTrend[];
  events: ReportEvent[];
  statusTimeline: StatusTimelineEvent[];
  diagnosis: {
    status: string;
    faultCodes: string[];
    alarmCodes: string[];
    unknownCodes: string[];
    partial: boolean;
    decisionRationale: string[];
    codeKnowledge: Array<{
      code: string;
      codeType: 'FAULT' | 'ALARM';
      knowledgeStatus: string;
      sourceDocuments: string[];
    }>;
  };
  recommendations: ReportRecommendation[];
  evidence: Array<{
    evidenceId: number | null;
    evidenceCode: string | null;
    type: string | null;
    source: string | null;
    content: string | null;
    userVisible: boolean;
  }>;
  narrative: ReportNarrative | null;
  limitations: string[];
}

export interface ReportNarrative {
  executiveSummary: string | null;
  operatingFindings: string[];
  anomalyAnalysis: string[];
  recommendations: ReportRecommendation[];
  riskNotice: string | null;
}

export interface ReportRecommendation {
  priority?: 'P1' | 'P2' | 'P3' | null;
  action?: string | null;
  steps?: string[];
  // Kept for internal consumers; it is intentionally not rendered in the report.
  basis?: string[];
  // Compatibility with the previous deterministic recommendation response.
  content?: string | null;
  source?: string | null;
}

export interface OperationReportResponse {
  reportCode: string;
  deviceName: string;
  inverterName?: string;
  healthStatus: ReportHealthStatus;
  periodStatus: ReportHealthStatus;
  currentStatus: ReportHealthStatus;
  reportStatus: string;
  summary: string;
  markdown: string;
  report: OperationReportResult;
  generatedAt: string;
  requestedStartTime: string;
  requestedEndTime: string;
  fallbackToLatestData: boolean;
}
