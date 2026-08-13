<script setup lang="ts">
import type { ReportEvent, ReportHealthStatus, StatusTimelineEvent } from '@/api/report';

interface TimelineSegment {
  status: ReportHealthStatus;
  start: number;
  end: number;
}

interface TimelineMarker {
  time: number;
  label: string | null;
  type: 'FAULT' | 'ALARM' | 'RECOVERED';
}

const props = defineProps<{
  windowStart: string;
  windowEnd: string;
  statusTimeline: StatusTimelineEvent[];
  events: ReportEvent[];
  currentStatus: ReportHealthStatus;
}>();

const statusLabels: Record<ReportHealthStatus, string> = {
  NORMAL: '正常',
  ATTENTION: '关注',
  FAULT: '故障',
  UNKNOWN: '未知',
};

const windowRange = computed(() => {
  const start = toMilliseconds(props.windowStart);
  const end = toMilliseconds(props.windowEnd);
  return start !== null && end !== null && end > start ? { start, end } : null;
});

const segments = computed<TimelineSegment[]>(() => {
  const range = windowRange.value;
  if (!range) {
    return [];
  }

  const changes = props.statusTimeline
    .flatMap((event) => {
      const time = toMilliseconds(event.observedAt);
      return time === null ? [] : [{ time, status: statusOf(event) }];
    })
    .filter(change => change.time < range.end)
    .sort((left, right) => left.time - right.time);
  const initial = [...changes].reverse().find(change => change.time <= range.start)
    || changes.find(change => change.time > range.start);

  if (!initial) {
    return [{ status: props.currentStatus, start: range.start, end: range.end }];
  }

  const result: TimelineSegment[] = [];
  let currentStatus = initial.status;
  let segmentStart = range.start;
  for (const change of changes) {
    if (change.time <= range.start || change.status === currentStatus) {
      continue;
    }
    result.push({ status: currentStatus, start: segmentStart, end: change.time });
    currentStatus = change.status;
    segmentStart = change.time;
  }
  result.push({ status: currentStatus, start: segmentStart, end: range.end });
  return result.filter(segment => segment.end > segment.start);
});

const markers = computed<TimelineMarker[]>(() => {
  const range = windowRange.value;
  if (!range) {
    return [];
  }
  const eventMarkers = props.events.flatMap(event => [
    markerOf(event.firstSeenAt, eventLabel(event), event.type),
    markerOf(event.recoveredAt, null, 'RECOVERED'),
  ]);
  return eventMarkers
    .filter((marker): marker is TimelineMarker => Boolean(marker && marker.time >= range.start && marker.time <= range.end))
    .sort((left, right) => left.time - right.time);
});

const ticks = computed(() => {
  const range = windowRange.value;
  if (!range) {
    return [];
  }
  return Array.from({ length: 5 }, (_, index) => ({
    time: range.start + ((range.end - range.start) * index) / 4,
    position: index * 25,
  }));
});

const phaseSummary = computed(() => segments.value.map(segment => statusLabels[segment.status]));

const summary = computed(() => {
  if (!props.events.length && phaseSummary.value.length === 1 && phaseSummary.value[0] === '正常') {
    return '本周期设备持续处于正常状态，未记录故障或报警事件。';
  }

  const normalDuration = segments.value.filter(segment => segment.status === 'NORMAL')
    .reduce((total, segment) => total + segment.end - segment.start, 0);
  const duration = windowRange.value ? windowRange.value.end - windowRange.value.start : 0;
  const statusText = normalDuration >= duration / 2 ? '本周期设备大部分时间处于正常状态。' : '';
  if (!props.events.length) {
    return `${statusText}报告结束时设备状态${statusLabels[props.currentStatus]}。`;
  }

  const byCode = new Map<string, ReportEvent[]>();
  for (const event of props.events) {
    byCode.set(event.code, [...(byCode.get(event.code) || []), event]);
  }
  const eventText = byCode.size === 1
    ? summaryForCode([...byCode.entries()][0])
    : summaryForMultipleCodes(props.events);
  return `${statusText}${eventText}报告结束时设备状态${statusLabels[props.currentStatus]}。`;
});

function summaryForCode([code, events]: [string, ReportEvent[]]) {
  if (events.length === 1) {
    return `${code} ${eventDescription(events[0])}；`;
  }
  const descriptions = events.map(event => eventInterval(event)).join('、');
  const allRecovered = events.every(event => Boolean(event.recoveredAt));
  return `${code} 共出现 ${events.length} 次：${descriptions}${allRecovered ? '，均已恢复' : ''}；`;
}

function summaryForMultipleCodes(events: ReportEvent[]) {
  const recovered = events.filter(event => Boolean(event.recoveredAt)).length;
  const active = events.filter(event => event.active).length;
  const recoveryTimeUnknown = events.length - recovered - active;
  return recoveryTimeUnknown
    ? `周期内共出现 ${events.length} 次异常事件，其中 ${recovered} 次已恢复，${active} 次在窗口结束时仍活动，${recoveryTimeUnknown} 次未记录恢复时间。`
    : active
      ? `周期内共出现 ${events.length} 次异常事件，其中 ${recovered} 次已恢复，${active} 次在窗口结束时仍活动。`
      : `周期内共出现 ${events.length} 次异常事件，均已恢复。`;
}

function segmentStyle(segment: TimelineSegment) {
  const range = windowRange.value;
  if (!range) {
    return {};
  }
  const duration = range.end - range.start;
  return {
    left: `${((segment.start - range.start) / duration) * 100}%`,
    width: `${((segment.end - segment.start) / duration) * 100}%`,
  };
}

function markerStyle(marker: TimelineMarker) {
  const range = windowRange.value;
  if (!range) {
    return {};
  }
  const position = ((marker.time - range.start) / (range.end - range.start)) * 100;
  return { left: `${Math.max(0, Math.min(100, position))}%` };
}

function markerClass(marker: TimelineMarker) {
  const range = windowRange.value;
  if (!range) {
    return '';
  }
  const ratio = (marker.time - range.start) / (range.end - range.start);
  return ratio < 0.12 ? 'marker-start' : ratio > 0.88 ? 'marker-end' : 'marker-center';
}

function showSegmentLabel(segment: TimelineSegment) {
  const range = windowRange.value;
  return Boolean(range && (segment.end - segment.start) / (range.end - range.start) >= 0.08);
}

function statusOf(event: StatusTimelineEvent): ReportHealthStatus {
  if (event.faultCode) {
    return 'FAULT';
  }
  if (event.alarmCode) {
    return 'ATTENTION';
  }
  const status = event.status?.trim().toUpperCase();
  if (status === 'NORMAL' || status === '0') {
    return 'NORMAL';
  }
  if (status === 'ATTENTION') {
    return 'ATTENTION';
  }
  if (status === 'FAULT') {
    return 'FAULT';
  }
  return 'UNKNOWN';
}

function markerOf(timeValue: string | null, label: string | null, type: TimelineMarker['type']) {
  const time = toMilliseconds(timeValue);
  return time === null ? null : { time, label, type };
}

function toMilliseconds(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const normalized = value.trim().replace(' ', 'T');
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatClock(value: number) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
}

function formatDuration(milliseconds: number) {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} 小时 ${remainingMinutes} 分钟` : `${hours} 小时`;
}

function eventLabel(event: ReportEvent) {
  const interval = eventInterval(event);
  return interval ? `${event.code} ${interval}` : event.code;
}

function eventDescription(event: ReportEvent) {
  const start = toMilliseconds(event.firstSeenAt);
  const end = toMilliseconds(event.recoveredAt);
  if (start === null) {
    return '已记录为异常事件';
  }
  if (end !== null) {
    return `于 ${formatClock(start)} 出现，持续约 ${formatDuration(end - start)}，于 ${formatClock(end)} 恢复`;
  }
  return event.active
    ? `于 ${formatClock(start)} 出现，报告结束时仍处于活动状态`
    : `于 ${formatClock(start)} 出现，未记录恢复时间`;
}

function eventInterval(event: ReportEvent) {
  const start = toMilliseconds(event.firstSeenAt);
  if (start === null) {
    return '';
  }
  const end = toMilliseconds(event.recoveredAt);
  return end === null ? `${formatClock(start)} 起` : `${formatClock(start)}–${formatClock(end)}`;
}
</script>

<template>
  <div class="status-timeline">
    <div class="timeline-ruler" aria-label="分析周期时间刻度">
      <span v-for="tick in ticks" :key="tick.position" :style="{ left: `${tick.position}%` }">
        <i />{{ formatClock(tick.time) }}
      </span>
    </div>
    <div class="timeline-markers" aria-label="异常事件标记">
      <span
        v-for="marker in markers" :key="`${marker.time}-${marker.type}-${marker.label || ''}`" class="timeline-marker"
        :class="[`marker-${marker.type.toLowerCase()}`, markerClass(marker)]" :style="markerStyle(marker)"
        :title="marker.label || `${formatClock(marker.time)} 恢复`"
      >
        <i />
        <b v-if="marker.label">{{ marker.label }}</b>
      </span>
    </div>
    <div class="timeline-track" aria-label="设备运行状态时间线">
      <span
        v-for="segment in segments" :key="`${segment.start}-${segment.end}-${segment.status}`" class="timeline-segment"
        :class="`segment-${segment.status.toLowerCase()}`" :style="segmentStyle(segment)" :title="statusLabels[segment.status]"
      >
        <span v-if="showSegmentLabel(segment)">{{ statusLabels[segment.status] }}</span>
      </span>
    </div>
    <p class="timeline-summary">
      {{ summary }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.status-timeline {
  padding-top: 6px;
}

.timeline-ruler {
  position: relative;
  height: 25px;
  color: #718095;
  font-size: 12px;
}

.timeline-ruler span {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 5px;
  transform: translateX(-50%);
}

.timeline-ruler span:first-child { transform: none; }
.timeline-ruler span:last-child { transform: translateX(-100%); }
.timeline-ruler i { width: 1px; height: 5px; background: #aab8c6; }

.timeline-markers {
  position: relative;
  height: 27px;
  margin: 0 2px;
}

.timeline-marker {
  position: absolute;
  bottom: -2px;
  display: flex;
  min-width: 1px;
  height: 12px;
  align-items: center;
  color: #b87412;
  transform: translateX(-50%);
}

.timeline-marker i {
  position: absolute;
  bottom: -3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentcolor;
  box-shadow: 0 0 0 2px #fff;
}

.timeline-marker b {
  position: absolute;
  bottom: 10px;
  max-width: 130px;
  overflow: hidden;
  color: currentcolor;
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marker-start b { left: 0; transform: none; }
.marker-center b { left: 50%; transform: translateX(-50%); }
.marker-end b { right: 0; transform: none; }

.marker-fault { color: #c74b4b; }
.marker-recovered { color: #27805f; }

.timeline-track {
  position: relative;
  height: 28px;
  overflow: hidden;
  border: 1px solid #dce5ee;
  border-radius: 7px;
  background: #f7f9fc;
}

.timeline-segment {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  min-width: 0;
  padding: 0 8px;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
}

.timeline-segment span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.segment-normal { color: #277c5e; background: #e5f3eb; }
.segment-attention { color: #a56308; background: #fce9bf; }
.segment-fault { color: #b33c3c; background: #f8dede; }
.segment-unknown { color: #627080; background: #e3e7eb; }

.timeline-summary {
  margin: 16px 0 0;
  color: #40566d;
  line-height: 1.8;
}

@media print {
  .status-timeline { padding-top: 4px; }
  .timeline-markers { height: 24px; }
  .timeline-marker b { font-size: 10px; }
}
</style>
