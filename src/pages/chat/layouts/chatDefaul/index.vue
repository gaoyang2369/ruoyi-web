<!-- 默认消息列表页 -->
<script setup lang="ts">
import { ref } from 'vue';
import ChatSender from '@/components/ChatSender/index.vue';
import WelecomeText from '@/components/WelecomeText/index.vue';
import { useUserStore } from '@/stores';
import { useSessionStore } from '@/stores/modules/session';

const userStore = useUserStore();
const sessionStore = useSessionStore();

const senderValue = ref('');

const quickPrompts = [
  {
    title: '运行概览',
    icon: 'DataAnalysis',
    questions: [
      'G120电机1当前运行状态怎么样？',
      'G120电机1最近1小时有没有故障或报警？是否已经恢复？',
      '查看G120电机1最近30分钟的转速、电流、功率和温度情况',
    ],
  },
  {
    title: '异常诊断',
    icon: 'WarningFilled',
    questions: [
      '诊断G120电机1当前异常，并给出可能原因和排查顺序',
      '当前哪些运行指标最值得优先检查？',
      '结合当前运行数据，给出下一步现场检查建议',
    ],
  },
  {
    title: '报告与趋势',
    icon: 'Document',
    questions: [
      '生成G120电机1最近1小时运行报告',
      '分析最近1小时电机温度和负载变化，是否存在异常趋势？',
      '总结G120电机1最近1小时的主要异常和风险',
    ],
  },
  {
    title: '故障知识',
    icon: 'Reading',
    questions: [
      'A07089报警是什么意思？应该怎么处理？',
      'F30899故障的可能原因和处理步骤是什么？',
      '根据S120故障手册查询A07089相关参数和排查建议',
    ],
  },
];

async function handleSubmit(content: string) {
  localStorage.setItem('chatContent', content);

  senderValue.value = '';
  await sessionStore.createSessionList({
    userId: userStore.userInfo?.userId as number,
    sessionContent: content,
    sessionTitle: content.slice(0, 10),
    remark: content.slice(0, 10),
  });
}

function handleQuickPrompt(content: string) {
  handleSubmit(content);
}
</script>

<template>
  <div class="chat-defaul-wrap">
    <WelecomeText />
    <section class="quick-prompts" aria-label="快速提问">
      <div class="quick-prompts-heading">
        <span>快速提问</span>
        <small>选择一个问题即可开始对话</small>
      </div>
      <div class="quick-prompts-grid">
        <article
          v-for="item in quickPrompts"
          :key="item.title"
          class="quick-prompt-card"
        >
          <span class="quick-prompt-title">
            <el-icon class="quick-prompt-icon">
              <component :is="item.icon" />
            </el-icon>
            <strong>{{ item.title }}</strong>
          </span>
          <span class="quick-prompt-list">
            <button
              v-for="question in item.questions"
              :key="question"
              class="quick-prompt-chip"
              type="button"
              @click.stop="handleQuickPrompt(question)"
            >
              {{ question }}
            </button>
          </span>
        </article>
      </div>
    </section>
    <ChatSender
      v-model="senderValue"
      placeholder="描述设备问题、告警信息或你想查询的内容…"
      @submit="handleSubmit"
    />
    <p class="input-tip">
      AI 建议仅供参考，请结合现场工况和操作规范确认。
    </p>
  </div>
</template>

<style scoped lang="scss">
.chat-defaul-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 920px;
  min-height: 100%;
  padding: clamp(36px, 8vh, 96px) 24px 32px;
  box-sizing: border-box;
}

.quick-prompts {
  width: 100%;
  margin: 4px 0 14px;
}

.quick-prompts-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
  color: #172033;
  font-size: 15px;
  font-weight: 650;

  small {
    color: #7b8494;
    font-size: 13px;
    font-weight: 400;
  }
}

.quick-prompts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.quick-prompt-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
  padding: 13px;
  color: inherit;
  text-align: left;
  background: #fff;
  border: 1px solid #e8edf5;
  border-radius: 12px;
}

.quick-prompt-title {
  display: flex;
  gap: 7px;
  align-items: center;
  margin-bottom: 10px;

  strong {
    color: #27334a;
    font-size: 14px;
    font-weight: 650;
  }
}

.quick-prompt-icon {
  color: #3976ea;
  font-size: 16px;
}

.quick-prompt-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 6px;
}

.quick-prompt-chip {
  width: 100%;
  padding: 7px 9px;
  overflow: hidden;
  color: #526277;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  cursor: pointer;
  background: #f8faff;
  border: 1px solid transparent;
  border-radius: 8px;
  transition: background-color 0.18s ease, border-color 0.18s ease;

  &:hover {
    color: #2f66c8;
    background: #f1f6ff;
    border-color: #d8e6ff;
  }

  &:focus-visible {
    outline: 2px solid #8aafff;
    outline-offset: 1px;
  }
}

.input-tip {
  width: 100%;
  margin: 10px 0 0;
  color: #77869a;
  font-size: 12px;
  text-align: center;
}

@media (max-width: 640px) {
  .chat-defaul-wrap {
    padding: 32px 16px 24px;
  }

  .quick-prompts-grid {
    grid-template-columns: 1fr;
  }

  .quick-prompts-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
}
</style>
