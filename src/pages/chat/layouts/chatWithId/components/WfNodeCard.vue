<script setup lang="ts">
// 工作流节点输入/输出卡片：复用 ToolCallCard 的视觉风格。
export interface WfNodeEvent {
  key: number;
  nodeUuid: string;
  nodeTitle?: string;
  type: 'input' | 'output' | 'run';
  data: any;
  timestamp: number;
}

const props = defineProps<{
  event: WfNodeEvent;
}>();

const isExpanded = ref(false);

const typeConfig = computed(() => {
  switch (props.event.type) {
    case 'input':
      return { icon: 'Download', color: '#409EFF', bgColor: 'rgba(64, 158, 255, 0.1)', text: '节点输入' };
    case 'output':
      return { icon: 'Upload', color: '#67C23A', bgColor: 'rgba(103, 194, 58, 0.1)', text: '节点输出' };
    case 'run':
      return { icon: 'Promotion', color: '#E6A23C', bgColor: 'rgba(230, 162, 60, 0.1)', text: '节点运行' };
    default:
      return { icon: 'QuestionFilled', color: '#909399', bgColor: 'rgba(144, 147, 153, 0.1)', text: '节点' };
  }
});

const formattedData = computed(() => {
  if (props.event.data == null)
    return null;
  try {
    if (typeof props.event.data === 'string') {
      // 尝试美化 JSON，失败则原样返回
      try {
        return JSON.stringify(JSON.parse(props.event.data), null, 2);
      }
      catch {
        return props.event.data;
      }
    }
    return JSON.stringify(props.event.data, null, 2);
  }
  catch {
    return String(props.event.data);
  }
});
</script>

<template>
  <div class="wf-node-card" :class="{ expanded: isExpanded }">
    <div class="card-header" @click="isExpanded = !isExpanded">
      <div class="header-left">
        <div class="node-icon" :style="{ background: typeConfig.color }">
          <el-icon :size="14">
            <component :is="typeConfig.icon" />
          </el-icon>
        </div>
        <span class="node-title">{{ event.nodeTitle || '节点' }}</span>
        <el-tag
          :style="{
            color: typeConfig.color,
            backgroundColor: typeConfig.bgColor,
            borderColor: typeConfig.color,
          }"
          size="small"
          class="type-tag"
        >
          {{ typeConfig.text }}
        </el-tag>
      </div>
      <div class="header-right">
        <el-icon class="expand-icon" :class="{ rotated: isExpanded }">
          <ArrowDown />
        </el-icon>
      </div>
    </div>

    <el-collapse-transition>
      <div v-show="isExpanded" class="card-content">
        <div v-if="formattedData" class="result-section">
          <div class="result-content">
            <pre>{{ formattedData }}</pre>
          </div>
        </div>
        <div v-else class="no-result">
          <span>暂无数据</span>
        </div>
      </div>
    </el-collapse-transition>
  </div>
</template>

<style scoped lang="scss">
.wf-node-card {
  background-color: #ffffff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  margin: 8px 0;
  font-size: 13px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }

  &.expanded {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    cursor: pointer;
    user-select: none;
    transition: background-color 0.2s ease;

    &:hover {
      background-color: #f5f7fa;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;

      .node-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        color: #ffffff;
        flex-shrink: 0;
      }

      .node-title {
        font-weight: 500;
        color: #303133;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .type-tag {
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 12px;
        flex-shrink: 0;
      }
    }

    .header-right {
      .expand-icon {
        color: #909399;
        transition: transform 0.3s ease;

        &.rotated {
          transform: rotate(180deg);
        }
      }
    }
  }

  .card-content {
    padding: 0 12px 12px;
    border-top: 1px solid #ebeef5;

    .result-content {
      background-color: #f5f7fa;
      border-radius: 6px;
      padding: 10px 12px;
      margin-top: 12px;
      max-height: 300px;
      overflow: auto;

      pre {
        margin: 0;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 12px;
        line-height: 1.5;
        color: #303133;
        white-space: pre-wrap;
        word-break: break-word;
      }
    }

    .no-result {
      text-align: center;
      padding: 16px;
      color: #909399;
      font-size: 12px;
    }
  }
}
</style>
