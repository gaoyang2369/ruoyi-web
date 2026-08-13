<script setup lang="ts">
import type { ReportEvent, ReportHealthStatus, StatusTimelineEvent } from '@/api/report';

interface TimelineSegment {
  status: ReportHealthStatus;
  start: number;
  end: number;
}

interface TimelineMarker {
  time: number;
  text: string;
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
    markerOf(event.firstSeenAt, `${event.code} 触发`, event.type),
    markerOf(event.recoveredAt, `${event.code} 恢复`, 'RECOVERED'),
  ]);
  return eventMarkers
    .filter((marker): marker is TimelineMarker => Boolean(marker && marker.time >= range.start && marker.time <= range.end))
    .sort((left, right) => left.time - right.time);
});

const phaseSummary = computed(() => {
  return segments.value.map(segment => statusLabels[segment.status]);
});

const summary = computed(() => {
  if (!props.events.length && phaseSummary.value.length === 1 && phaseSummary.value[0] === '正常') {
    return '本周期设备持续处于正常状态，未记录故障或报警事件。';
  }

  const stageText = phaseSummary.value.length
    ? `本周期设备经历“${phaseSummary.value.join(' → ')}”${phaseSummary.value.length > 1 ? `${phaseSummary.value.length} 个阶段` : '阶段'}。`
    : '本周期未获得可用的状态变化记录。';
  if (!props.events.length) {
    return `${stageText}报告结束时设备状态${statusLabels[props.currentStatus]}。`;
  }

  if (props.events.length === 1) {
    const [event] = props.events;
    const start = toMilliseconds(event.firstSeenAt);
    const end = toMilliseconds(event.recoveredAt);
    const eventText = start === null
      ? `${event.code} 已记录为${event.type === 'FAULT' ? '故障' : '报警'}事件。`
      : end === null
        ? event.active
          ? `${event.code} 于 ${formatClock(start)} 出现，报告结束时仍活动。`
          : `${event.code} 于 ${formatClock(start)} 出现，未记录恢复时间。`
        : `${event.code} 于 ${formatClock(start)} 出现，持续约 ${formatDuration(end - start)}，并于 ${formatClock(end)} 恢复。`;
    return `${stageText}${eventText}报告结束时设备状态${statusLabels[props.currentStatus]}。`;
  }

  const recovered = props.events.filter(event => Boolean(event.recoveredAt)).length;
  const active = props.events.filter(event => event.active).length;
  const recoveryTimeUnknown = props.events.length - recovered - active;
  const eventText = recoveryTimeUnknown
    ? `周期内共出现 ${props.events.length} 次异常事件，其中 ${recovered} 次已恢复，${active} 次在窗口结束时仍活动，${recoveryTimeUnknown} 次未记录恢复时间。`
    : active
      ? `周期内共出现 ${props.events.length} 次异常事件，其中 ${recovered} 次已恢复，${active} 次在窗口结束时仍活动。`
      : `周期内共出现 ${props.events.length} 次异常事件，均已恢复。`;
  return `${stageText}${eventText}报告结束时设备状态${statusLabels[props.currentStatus]}。`;
});

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

function markerOf(timeValue: string | null, text: string, type: TimelineMarker['type']) {
  const time = toMilliseconds(timeValue);
  return time === null ? null : { time, text, type };
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
</script>

<template>
  <div class="status-timeline">
    <div class="timeline-ruler">
      <span>{{ formatClock(windowRange?.start || 0) }}</span>
      <span>{{ formatClock(windowRange?.end || 0) }}</span>
    </div>
    <div class="timeline-markers" aria-label="异常事件标记">
      <span
        v-for="marker in markers" :key="`${marker.time}-${marker.text}`" class="timeline-marker"
        :class="`marker-${marker.type.toLowerCase()}`" :style="markerStyle(marker)" :title="`${formatClock(marker.time)} ${marker.text}`"
      >
        <i />
        <b>{{ marker.text }}</b>
      </span>
    </div>
    <div class="timeline-track" aria-label="设备运行状态时间线">
      <span
        v-for="segment in segments" :key="`${segment.start}-${segment.end}-${segment.status}`" class="timeline-segment"
        :class="`segment-${segment.status.toLowerCase()}`" :style="segmentStyle(segment)"
      >
        <span>{{ statusLabels[segment.status] }}</span>
      </span>
    </div>
    <p class="timeline-summary">
      {{ summary }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.status-timeline {
  padding-top: 18px;
}

.timeline-ruler {
  display: flex;
  justify-content: space-between;
  color: #718095;
  font-size: 12px;
}

.timeline-markers {
  position: relative;
  height: 42px;
  margin: 0 4px;
}

.timeline-marker {
  position: absolute;
  bottom: -9px;
  display: flex;
  min-width: 1px;
  height: 30px;
  align-items: flex-end;
  border-left: 1px dashed currentcolor;
  color: #b87412;
  transform: translateX(-50%);
}

.timeline-marker i {
  position: absolute;
  bottom: -4px;
  width: 7px;
  height: 7px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: currentcolor;
}

.timeline-marker b {
  position: absolute;
  bottom: 15px;
  max-width: 94px;
  overflow: hidden;
  color: currentcolor;
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marker-fault { color: #c74b4b; }
.marker-recovered { color: #27805f; }

.timeline-track {
  position: relative;
  height: 38px;
  overflow: hidden;
  border: 1px solid #dce5ee;
  border-radius: 8px;
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

.segment-normal { background: #27805f; }
.segment-attention { background: #d49427; }
.segment-fault { background: #c74b4b; }
.segment-unknown { background: #758195; }

.timeline-summary {
  margin: 16px 0 0;
  color: #40566d;
  line-height: 1.8;
}

@media print {
  .status-timeline { padding-top: 10px; }
  .timeline-markers { height: 36px; }
  .timeline-marker b { font-size: 10px; }
}
</style>
