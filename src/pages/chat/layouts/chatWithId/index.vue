<!-- 每个回话对应的聊天内容 -->
<script setup lang="ts">
import type { AnyObject } from 'typescript-api-pro';
import type { BubbleProps } from 'vue-element-plus-x/types/Bubble';
import type { BubbleListInstance } from 'vue-element-plus-x/types/BubbleList';
import type { ChatSyncEvent, ToolCallInfo, VoiceStatus, WfNodeEvent } from './types';
import type { SendDTO, WfNodeInput, WfNodeInputDef } from '@/api/chat/types';
import type { BrowserVoice } from '@/composables/useBrowserVoice';
import { useHookFetch } from 'hook-fetch/vue';
import { nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { send } from '@/api';
import assistantAvatar from '@/assets/images/logo.png';
import ChatSender from '@/components/ChatSender/index.vue';
import { useAgentStore } from '@/stores/modules/agent';
import { useChatStore } from '@/stores/modules/chat';
import { useDesignStore } from '@/stores/modules/design';
import { useModelStore } from '@/stores/modules/model';
import { useUserStore } from '@/stores/modules/user';
import { codeXRender } from '@/utils/markdownRenderers';
import AnalysisTracePanel from './components/AnalysisTracePanel.vue';
import WfNodeCard from './components/WfNodeCard.vue';

const props = defineProps<{
  voice: BrowserVoice;
}>();

const emit = defineEmits<{
  toggleVoiceWake: [];
}>();

type MessageItem = BubbleProps & {
  key: number;
  role: 'ai' | 'user' | 'system';
  avatar: string;
  class?: string;
  /** 工作流人机交互：渲染为输入框气泡 */
  isWorkflowFeedback?: boolean;
  /** 人机交互提示词 */
  feedbackTip?: string;
  /** 人机交互输入框临时内容 */
  feedbackValue?: string;
  /** 语音同步消息所属请求，用于把增量、工具进度和结束事件归到同一回复 */
  requestId?: string;
  /** 消息来源。VOICE 仍复用现有用户/助手气泡渲染。 */
  source?: string;
  /** 该回复关联的工具执行进度 */
  toolCallEvents?: ToolCallInfo[];
  /** 当前回复的轻量分析进度，仅展示给用户可理解的阶段信息。 */
  analysisStatus?: 'analyzing' | 'querying' | 'generating' | 'completed' | 'failed' | 'cancelled';
  analysisStartedAt?: number;
  hasReceivedContent?: boolean;
};

const route = useRoute();
const chatStore = useChatStore();
const modelStore = useModelStore();
const agentStore = useAgentStore();
const userStore = useUserStore();
const designStore = useDesignStore();

// Markdown 主题跟随应用主题，避免浅色主题下渲染出深色表格底色
const markdownThemeMode = computed(() => (designStore.darkMode === 'dark' ? 'dark' : 'light'));

// 用户头像
const avatar = computed(() => {
  const userInfo = userStore.userInfo;
  return userInfo?.avatar || 'https://avatars.githubusercontent.com/u/32251822?s=96&v=4';
});

const inputValue = ref('');
const chatSenderRef = ref<InstanceType<typeof ChatSender> | null>(null);
const bubbleItems = ref<MessageItem[]>([]);
const bubbleListRef = ref<BubbleListInstance | null>(null);
const browserVoice = props.voice;

const voiceStatus = ref<VoiceStatus>('IDLE');
const voiceStatusText: Record<VoiceStatus, string> = {
  IDLE: '等待唤醒',
  LISTENING: '正在聆听',
  RECOGNIZING: '正在识别',
  THINKING: '正在分析',
  SPEAKING: '正在播报',
};

let chatSyncSocket: WebSocket | null = null;
let chatSyncReconnectTimer: number | undefined;
let chatSyncReconnectAttempts = 0;
let shouldKeepChatSyncConnected = false;
const receivedSyncEventIds = new Set<string>();

// 工具调用事件计数器（用于生成唯一 key）
let toolCallKeyCounter = 0;

// 工作流节点事件列表（节点输入/输出/运行卡片）
const wfNodeEvents = ref<WfNodeEvent[]>([]);
let wfNodeKeyCounter = 0;
// 节点 uuid -> 标题 映射（从工作流详情取，用于卡片展示）
const wfNodeUuidToTitle = computed<Record<string, string>>(() =>
  chatStore.currentWorkflow?.nodeTitles ? { ...chatStore.currentWorkflow.nodeTitles } : {},
);
// 当前工作流运行时 uuid（从 [START] 事件解析，用于人机交互恢复）
let wfRuntimeUuid = '';
// 节点 uuid -> runtimeNode uuid 映射（[NODE_RUN] 时建立，供 [NODE_INPUT/OUTPUT] 关联）
const wfNodeUuidToRuntimeUuid = ref<Record<string, string>>({});

// 当前是否选中工作流（全局，与智能体互斥）
const currentBinding = computed(() => chatStore.currentWorkflow);
const hasWfNodeEvents = computed(() => wfNodeEvents.value.length > 0);
// Hermes 故障诊断只展示结构化分析进度；不启用也不暴露“深度思考”。
const isFaultDiagnosisAgent = computed(() => agentStore.currentAgentInfo?.scenarioCode === 'FAULT_DIAGNOSIS');

const analysisPanelOpen = ref(false);
let analysisPanelCollapseTimer: number | undefined;
const activeAnalysisMessage = computed(() => [...bubbleItems.value].reverse().find(item =>
  item.role === 'system' && item.analysisStatus && item.analysisStartedAt,
));
const analysisPanelLabel = computed(() => {
  const status = activeAnalysisMessage.value?.analysisStatus;
  if (status === 'completed')
    return '分析完成';
  if (status === 'failed')
    return '分析失败';
  if (status === 'cancelled')
    return '分析已取消';
  return '分析中';
});

const copyIconMap = ref<Record<number, string>>({}); // 记录每条消息的复制按钮图标
const editingMessageKeys = ref<number[]>([]); // 跟踪多个编辑中的消息
const editedContents = ref<Record<number, string>>({}); // 存储每条消息的临时编辑内容

const {
  stream,
  loading: isLoading,
  cancel,
} = useHookFetch({
  request: send,
  onError: (err) => {
    console.warn('测试错误拦截', err);
  },
});

const removeVoiceCommand = browserVoice.onCommand((text) => {
  void startSSE(text);
});

// 组件挂载初始化
onMounted(() => {
  bubbleItems.value.forEach((item) => {
    copyIconMap.value[item.key] = 'CopyDocument';
  });
});

const currentSessionId = computed(() => {
  const id = route.params?.id;
  return id && id !== 'not_login' ? String(id) : undefined;
});

watch(
  [currentSessionId, () => userStore.token],
  ([sessionId, token]) => {
    disconnectChatSync();
    receivedSyncEventIds.clear();
    voiceStatus.value = 'IDLE';
    if (sessionId && token) {
      connectChatSync(sessionId, token);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  removeVoiceCommand();
  disconnectChatSync();
  if (analysisPanelCollapseTimer) {
    window.clearTimeout(analysisPanelCollapseTimer);
  }
});

let isThinking = false;
let pendingThinkTag = '';

watch(
  () => route.params?.id,
  async (_id_) => {
    if (_id_) {
      // 切换会话时清空工作流节点事件与当前请求的分析轨迹。
      toolCallKeyCounter = 0;
      analysisPanelOpen.value = false;
      wfNodeEvents.value = [];
      wfNodeKeyCounter = 0;
      wfNodeUuidToRuntimeUuid.value = {};
      wfRuntimeUuid = '';

      if (_id_ !== 'not_login') {
        // 判断的当前会话id是否有聊天记录，有缓存则直接赋值展示
        if (chatStore.chatMap[`${_id_}`] && chatStore.chatMap[`${_id_}`].length) {
          bubbleItems.value = chatStore.chatMap[`${_id_}`] as MessageItem[];
          // 滚动到底部
          setTimeout(() => {
            bubbleListRef.value?.scrollToBottom();
          }, 350);
          return;
        }

        // 无缓存则请求聊天记录
        await chatStore.requestChatList(`${_id_}`);
        // 请求聊天记录后，赋值回显，并滚动到底部
        bubbleItems.value = chatStore.chatMap[`${_id_}`] as MessageItem[];

        // 滚动到底部
        setTimeout(() => {
          bubbleListRef.value?.scrollToBottom();
        }, 350);
      }

      // 如果本地有发送内容 ，则直接发送
      const v = localStorage.getItem('chatContent');
      if (v) {
        // 发送消息
        setTimeout(() => {
          startSSE(v);
        }, 350);

        localStorage.removeItem('chatContent');
      }
    }
  },
  { immediate: true, deep: true },
);

// 封装错误处理逻辑
function handleError(err: any) {
  console.error('Fetch error:', err);
}

/**
 * 浏览器 WebSocket 不能设置 Authorization 请求头，因此按现有聊天 WebSocket 的约定，
 * 把当前 JWT 以 Authorization=Bearer xxx 放在握手查询参数中。
 * VITE_API_URL 既支持开发环境的绝对地址，也支持生产环境的 /prod-api 相对代理地址。
 */
function buildChatSyncWsUrl(sessionId: string, token: string): string {
  const apiBase = import.meta.env.VITE_API_URL || '';
  const isAbsoluteApiUrl = /^https?:\/\//i.test(apiBase);
  const baseUrl = isAbsoluteApiUrl ? apiBase : window.location.origin;
  const url = new URL(baseUrl);
  const basePath = isAbsoluteApiUrl ? url.pathname : apiBase;
  const normalizedBasePath = basePath.replace(/\/$/, '');

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${normalizedBasePath}/chat/sync/ws`.replace(/\/+/g, '/');
  url.search = '';
  url.searchParams.set('sessionId', sessionId);
  url.searchParams.set('Authorization', `Bearer ${token}`);
  url.searchParams.set('clientId', import.meta.env.VITE_CLIENT_ID || '');
  return url.toString();
}

function connectChatSync(sessionId: string, token: string) {
  shouldKeepChatSyncConnected = true;
  const socket = new WebSocket(buildChatSyncWsUrl(sessionId, token));
  chatSyncSocket = socket;

  socket.onopen = () => {
    if (chatSyncSocket !== socket) {
      return;
    }
    chatSyncReconnectAttempts = 0;
  };

  socket.onmessage = (message) => {
    if (chatSyncSocket !== socket || typeof message.data !== 'string') {
      return;
    }
    handleChatSyncMessage(message.data);
  };

  socket.onerror = () => {
    // onclose 统一负责重连，避免 error/close 触发两次定时器。
  };

  socket.onclose = () => {
    if (chatSyncSocket === socket) {
      chatSyncSocket = null;
    }
    scheduleChatSyncReconnect(sessionId, token);
  };
}

function disconnectChatSync() {
  shouldKeepChatSyncConnected = false;
  if (chatSyncReconnectTimer !== undefined) {
    window.clearTimeout(chatSyncReconnectTimer);
    chatSyncReconnectTimer = undefined;
  }
  if (chatSyncSocket) {
    const socket = chatSyncSocket;
    chatSyncSocket = null;
    socket.close();
  }
}

function scheduleChatSyncReconnect(sessionId: string, token: string) {
  if (!shouldKeepChatSyncConnected || sessionId !== currentSessionId.value || token !== userStore.token) {
    return;
  }
  if (chatSyncReconnectTimer !== undefined) {
    return;
  }
  const delay = Math.min(1000 * 2 ** chatSyncReconnectAttempts, 10000);
  chatSyncReconnectAttempts += 1;
  chatSyncReconnectTimer = window.setTimeout(() => {
    chatSyncReconnectTimer = undefined;
    if (shouldKeepChatSyncConnected && sessionId === currentSessionId.value && token === userStore.token) {
      connectChatSync(sessionId, token);
    }
  }, delay);
}

function handleChatSyncMessage(rawMessage: string) {
  let rawEvent: ChatSyncEvent;
  try {
    rawEvent = JSON.parse(rawMessage) as ChatSyncEvent;
  }
  catch {
    console.warn('[Chat Sync] 无法解析 WebSocket 消息:', rawMessage);
    return;
  }

  const event = normalizeChatSyncEvent(rawEvent);
  const eventType = String(event.type || event.event || '').toUpperCase();
  const eventId = String(event.id || event.eventId || event.messageId || '');
  if (eventId) {
    if (receivedSyncEventIds.has(eventId)) {
      return;
    }
    receivedSyncEventIds.add(eventId);
    // 仅保留有限去重记录，防止长会话持续占用内存。
    if (receivedSyncEventIds.size > 500) {
      receivedSyncEventIds.clear();
    }
  }

  switch (eventType) {
    case 'USER_MESSAGE':
      handleSyncUserMessage(event);
      break;
    case 'TOOL_PROGRESS':
      handleSyncToolProgress(event);
      break;
    case 'ASSISTANT_DELTA':
      handleSyncAssistantDelta(event);
      break;
    case 'ASSISTANT_DONE':
      handleSyncAssistantDone(event);
      break;
    case 'VOICE_STATUS':
      updateVoiceStatus(event.status ?? event.voiceStatus ?? event.state);
      break;
    default:
      console.warn('[Chat Sync] 未知事件类型:', eventType);
  }
}

function normalizeChatSyncEvent(rawEvent: ChatSyncEvent): Record<string, any> {
  const nested = rawEvent.data && typeof rawEvent.data === 'object'
    ? rawEvent.data
    : rawEvent.payload && typeof rawEvent.payload === 'object'
      ? rawEvent.payload
      : {};
  return { ...rawEvent, ...nested };
}

function getSyncRequestId(event: Record<string, any>): string {
  const requestId = event.requestId ?? event.request_id ?? event.clientRequestId ?? event.client_request_id ?? event.id;
  return requestId ? String(requestId) : `voice-${Date.now()}`;
}

function getSyncText(event: Record<string, any>): string {
  return String(event.delta ?? event.content ?? event.message ?? event.text ?? '');
}

function handleSyncUserMessage(event: Record<string, any>) {
  const content = getSyncText(event);
  if (!content) {
    return;
  }
  addMessage(content, true, { source: String(event.source || 'VOICE') });
  bubbleListRef.value?.scrollToBottom();
}

function ensureVoiceAssistantMessage(requestId: string): MessageItem {
  const existing = bubbleItems.value.find(item => item.requestId === requestId && item.source === 'VOICE');
  if (existing) {
    return existing;
  }
  addMessage('', false, { requestId, source: 'VOICE', toolCallEvents: [] });
  openAnalysisPanel();
  return bubbleItems.value[bubbleItems.value.length - 1];
}

function handleSyncAssistantDelta(event: Record<string, any>) {
  const content = getSyncText(event);
  if (!content) {
    return;
  }
  const message = ensureVoiceAssistantMessage(getSyncRequestId(event));
  message.content += content;
  message.loading = false;
  bubbleItems.value = [...bubbleItems.value];
  bubbleListRef.value?.scrollToBottom();
}

function handleSyncAssistantDone(event: Record<string, any>) {
  const message = ensureVoiceAssistantMessage(getSyncRequestId(event));
  message.typing = false;
  message.loading = false;
  const status = String(event.status || '').toUpperCase();
  finishAssistantAnalysis(message, status === 'ERROR' ? 'failed' : status === 'CANCELLED' ? 'cancelled' : 'completed');
  bubbleItems.value = [...bubbleItems.value];
  bubbleListRef.value?.scrollToBottom();
}

function handleSyncToolProgress(event: Record<string, any>) {
  const message = ensureVoiceAssistantMessage(getSyncRequestId(event));
  const tool = event.tool && typeof event.tool === 'object' ? event.tool : event;
  const toolId = String(tool.id ?? tool.toolId ?? tool.tool_id ?? '');
  const name = String(tool.name ?? tool.toolName ?? tool.tool_name ?? 'Hermes 工具');
  const status = normalizeToolStatus(tool.status ?? tool.state ?? event.status);
  const result = tool.result ?? tool.output ?? tool.message ?? tool.content ?? event.result ?? event.output ?? event.content;
  const tools = message.toolCallEvents ? [...message.toolCallEvents] : [];
  const index = tools.findIndex(item => (toolId && item.id === toolId) || (!toolId && item.name === name && item.status === 'pending'));
  const toolInfo: ToolCallInfo = {
    key: index >= 0 ? tools[index].key : ++toolCallKeyCounter,
    id: toolId || undefined,
    name,
    status,
    result: formatToolResult(result),
    timestamp: Date.now(),
  };

  if (index >= 0) {
    tools[index] = { ...tools[index], ...toolInfo };
  }
  else {
    tools.push(toolInfo);
  }
  message.toolCallEvents = tools;
  message.analysisStatus = 'querying';
  openAnalysisPanel();
  bubbleItems.value = [...bubbleItems.value];
  bubbleListRef.value?.scrollToBottom();
}

function markPendingToolsSuccess(message: MessageItem) {
  if (!message.toolCallEvents?.length) {
    return;
  }
  message.toolCallEvents = message.toolCallEvents.map(tool => tool.status === 'pending'
    ? { ...tool, status: 'success', timestamp: Date.now() }
    : tool);
}

function finishAssistantAnalysis(
  message: MessageItem | undefined,
  status: NonNullable<MessageItem['analysisStatus']>,
) {
  if (!message) {
    return;
  }
  if (status === 'completed') {
    markPendingToolsSuccess(message);
  }
  message.analysisStatus = status;
  scheduleAnalysisPanelCollapse(status);
}

function finishCurrentAssistantAnalysis(status: NonNullable<MessageItem['analysisStatus']>) {
  finishAssistantAnalysis(bubbleItems.value[bubbleItems.value.length - 1], status);
  bubbleItems.value = [...bubbleItems.value];
}

function openAnalysisPanel() {
  if (analysisPanelCollapseTimer) {
    window.clearTimeout(analysisPanelCollapseTimer);
    analysisPanelCollapseTimer = undefined;
  }
  analysisPanelOpen.value = true;
}

function collapseAnalysisPanel() {
  if (analysisPanelCollapseTimer) {
    window.clearTimeout(analysisPanelCollapseTimer);
    analysisPanelCollapseTimer = undefined;
  }
  analysisPanelOpen.value = false;
}

function scheduleAnalysisPanelCollapse(status: NonNullable<MessageItem['analysisStatus']>) {
  if (!['completed', 'failed', 'cancelled'].includes(status)) {
    return;
  }
  if (analysisPanelCollapseTimer) {
    window.clearTimeout(analysisPanelCollapseTimer);
  }
  analysisPanelCollapseTimer = window.setTimeout(() => {
    analysisPanelOpen.value = false;
    analysisPanelCollapseTimer = undefined;
  }, 1200);
}

function normalizeToolStatus(status: unknown): ToolCallInfo['status'] {
  const value = String(status || 'pending').toLowerCase();
  if (['success', 'completed', 'complete', 'done'].includes(value)) {
    return 'success';
  }
  if (['error', 'failed', 'failure'].includes(value)) {
    return 'error';
  }
  return 'pending';
}

function formatToolResult(result: unknown): string | null {
  if (result === undefined || result === null || result === '') {
    return null;
  }
  return typeof result === 'string' ? result : JSON.stringify(result);
}

function updateVoiceStatus(status: unknown) {
  const normalized = String(status || '').toUpperCase() as VoiceStatus;
  if (normalized in voiceStatusText) {
    voiceStatus.value = normalized;
  }
}

async function startSSE(chatContent: string) {
  if (!userStore.token) {
    userStore.ensureLogin('/chat', '登录后即可继续当前对话');
    // 浏览器语音命令未能发起请求时，恢复等待唤醒。
    browserVoice.resume();
    return;
  }

  browserVoice.pause();

  try {
    toolCallKeyCounter = 0;
    // 绑定了工作流时，清空上一次的节点事件
    if (currentBinding.value) {
      wfNodeEvents.value = [];
      wfNodeKeyCounter = 0;
      wfNodeUuidToRuntimeUuid.value = {};
      wfRuntimeUuid = '';
    }

    // 添加用户输入的消息
    inputValue.value = '';
    addMessage(chatContent, true);
    addMessage('', false, { toolCallEvents: [] });
    openAnalysisPanel();

    // 这里有必要调用一下 BubbleList 组件的滚动到底部 手动触发 自动滚动
    bubbleListRef.value?.scrollToBottom();

    // 获取最后一条用户消息（后端做了长期记忆缓存，只需发送最新的用户消息）
    const lastUserMessage = bubbleItems.value.filter((item: any) => item.role === 'user').pop();

    // 标记是否收到第一个有效数据 chunk（用于清除 loading 状态）
    let hasReceivedFirstContent = false;

    // 构造发送请求体
    const payload: SendDTO = {
      model: modelStore.currentModelInfo.modelName ?? '',
      agentId: agentStore.currentAgentInfo?.id || undefined,
      content: lastUserMessage?.content ?? '',
      sessionId: route.params?.id !== 'not_login' ? String(route.params?.id) : undefined,
      enableThinking: isFaultDiagnosisAgent.value ? false : undefined,
    };

    // 绑定了工作流：走工作流模式（后端 enableWorkFlow 优先级最高，会短路 agent/thinking）
    if (currentBinding.value) {
      payload.enableWorkFlow = true;
      payload.workFlowRunner = {
        uuid: currentBinding.value.uuid,
        inputs: buildWorkflowInputs(currentBinding.value, chatContent),
      };
    }

    for await (const chunk of stream(payload)) {
      // 处理数据块 - chunk.result 可能是字符串或对象
      // 返回 true 表示流结束
      const isStreamEnd = handleDataChunk(chunk.result as AnyObject | string);

      // 在收到第一个有效数据后清除 loading 状态（跳过连接状态事件）
      if (!hasReceivedFirstContent && chunk.result !== ':connected' && chunk.result !== ':disconnected' && !isStreamEnd) {
        const lastMessage = bubbleItems.value[bubbleItems.value.length - 1];
        if (lastMessage) {
          lastMessage.loading = false;
          bubbleItems.value = [...bubbleItems.value];
        }
        hasReceivedFirstContent = true;
      }

      if (isStreamEnd) {
        break; // 提前结束流处理
      }
      // 等待 Vue 更新 DOM，实现真正的流式渲染
      await nextTick();
    }
  }
  catch (err) {
    handleError(err);
    finishCurrentAssistantAnalysis('failed');
    // 出错时也要清除 loading 状态
    if (bubbleItems.value.length) {
      const lastMessage = bubbleItems.value[bubbleItems.value.length - 1];
      lastMessage.loading = false;
      bubbleItems.value = [...bubbleItems.value];
    }
  }
  finally {
    // 停止打字器状态
    if (bubbleItems.value.length) {
      const lastMessage = bubbleItems.value[bubbleItems.value.length - 1];
      lastMessage.typing = false;
      // 无条件重置 loading（停止打字动画）
      lastMessage.loading = false;
      if (lastMessage.analysisStatus === 'analyzing'
        || lastMessage.analysisStatus === 'querying'
        || lastMessage.analysisStatus === 'generating') {
        finishAssistantAnalysis(lastMessage, 'completed');
      }
      isThinking = false;
      pendingThinkTag = '';
      bubbleItems.value = [...bubbleItems.value];
    }
    browserVoice.resume();
  }
}

/**
 * 根据工作流绑定的 start 节点输入定义构造运行输入。
 * 约定：把本轮聊天内容填进第一个文本输入(type===1)；其它输入沿用绑定里预填的值。
 */
function buildWorkflowInputs(
  binding: { startInputs: WfNodeInputDef[]; inputs: WfNodeInput[] },
  chatContent: string,
): WfNodeInput[] {
  const base
    = binding.inputs && binding.inputs.length
      ? binding.inputs.map(i => ({ ...i, content: { ...i.content } }))
      : defaultInputsFromDefs(binding.startInputs);
  const textInput = base.find(i => i.content.type === 1);
  if (textInput) {
    textInput.content.value = chatContent;
  }
  return base;
}

function defaultInputsFromDefs(defs: WfNodeInputDef[]): WfNodeInput[] {
  return (defs || []).map(d => ({
    uuid: d.uuid,
    name: d.name,
    content: { title: d.title, value: null, type: d.type },
    required: d.required,
  }));
}

/**
 * 人机交互恢复：把用户输入作为 feedbackContent 发回 /chat/send，继续工作流。
 */
async function startResumeSSE(feedbackContent: string) {
  if (!feedbackContent.trim() || !wfRuntimeUuid) {
    return;
  }
  browserVoice.pause();
  try {
    addMessage(feedbackContent, true);
    addMessage('', false, { toolCallEvents: [] });
    openAnalysisPanel();
    bubbleListRef.value?.scrollToBottom();

    const payload: SendDTO = {
      model: modelStore.currentModelInfo.modelName ?? '',
      agentId: agentStore.currentAgentInfo?.id || undefined,
      content: feedbackContent,
      sessionId: route.params?.id !== 'not_login' ? String(route.params?.id) : undefined,
      enableThinking: isFaultDiagnosisAgent.value ? false : undefined,
      isResume: true,
      reSumeRunner: {
        runtimeUuid: wfRuntimeUuid,
        feedbackContent,
      },
    };

    let hasReceivedFirstContent = false;
    for await (const chunk of stream(payload)) {
      const isStreamEnd = handleDataChunk(chunk.result as AnyObject | string);
      if (!hasReceivedFirstContent && chunk.result !== ':connected' && chunk.result !== ':disconnected' && !isStreamEnd) {
        const lastMessage = bubbleItems.value[bubbleItems.value.length - 1];
        if (lastMessage) {
          lastMessage.loading = false;
          bubbleItems.value = [...bubbleItems.value];
        }
        hasReceivedFirstContent = true;
      }
      if (isStreamEnd) {
        break;
      }
      await nextTick();
    }
  }
  catch (err) {
    handleError(err);
    finishCurrentAssistantAnalysis('failed');
  }
  finally {
    if (bubbleItems.value.length) {
      const lastMessage = bubbleItems.value[bubbleItems.value.length - 1];
      lastMessage.typing = false;
      lastMessage.loading = false;
      if (lastMessage.analysisStatus === 'analyzing'
        || lastMessage.analysisStatus === 'querying'
        || lastMessage.analysisStatus === 'generating') {
        finishAssistantAnalysis(lastMessage, 'completed');
      }
      isThinking = false;
      pendingThinkTag = '';
      bubbleItems.value = [...bubbleItems.value];
    }
    browserVoice.resume();
  }
}

/**
 * 提交某条反馈气泡的输入。
 */
function submitFeedback(item: MessageItem) {
  const value = item.feedbackValue || '';
  // 把该反馈气泡标记为已提交（转为普通 system 文案），避免重复提交
  item.isWorkflowFeedback = false;
  item.content = `已回复：${value}`;
  bubbleItems.value = [...bubbleItems.value];
  startResumeSSE(value);
}

// 封装数据处理逻辑
function handleDataChunk(chunk: AnyObject | string): boolean {
  console.log('[SSE] 收到 chunk:', chunk, 'type:', typeof chunk);

  try {
    let dataObj: AnyObject | null = null;
    let eventType = '';
    let rawDataStr = '';

    if (typeof chunk === 'string') {
      if (chunk === ':connected' || chunk === ':disconnected') {
        console.log('[SSE] 连接状态:', chunk);
        return false;
      }

      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.substring(6).trim();
        }
        else if (line.startsWith('data:')) {
          rawDataStr = line.substring(5).trim();
          try {
            dataObj = JSON.parse(rawDataStr);
          }
          catch {
            console.warn('[SSE] JSON 解析失败:', rawDataStr);
          }
        }
      }

      // 工作流事件优先处理（事件名带方括号，如 [NODE_CHUNK_*] / [START] / [DONE]）
      if (eventType.startsWith('[')) {
        return handleWorkflowEvent(eventType, rawDataStr, dataObj);
      }

      if (eventType === 'done' || dataObj?.done === true) {
        console.log('[SSE] 流结束');
        finishCurrentAssistantAnalysis('completed');
        return true;
      }

      // 后端业务异常以 SSE error 事件发送；此前这里未处理，导致页面只留下一个空白助手气泡。
      if (eventType === 'error' || dataObj?.event === 'error') {
        const error = dataObj?.error || dataObj?.message || '请求处理失败，请稍后重试';
        handleContentChunk(`请求未能完成：${error}`);
        finishCurrentAssistantAnalysis('failed');
        return true;
      }

      if ((eventType === 'mcp' || eventType === 'mcp_tool') && dataObj) {
        handleMcpEvent(dataObj);
        return false;
      }

      if (dataObj && eventType === 'content') {
        const content = dataObj.content || '';
        if (content) {
          handleContentChunk(content);
        }
      }
    }
    else if (typeof chunk === 'object' && chunk !== null) {
      const parsedChunk = chunk?.choices?.[0]?.delta?.content;
      if (parsedChunk) {
        handleContentChunk(parsedChunk);
      }

      const directContent = chunk?.content;
      if (directContent) {
        handleContentChunk(directContent);
      }
    }
  }
  catch (err) {
    console.error('解析数据时出错:', err);
  }

  return false;
}

/**
 * 工作流 SSE 事件分发。事件名带方括号，来自后端 WorkflowEngine / AdiConstant.SSEEventName：
 * [START] / [DONE] / [ERROR] / [NODE_RUN_<uuid>] / [NODE_INPUT_<uuid>]
 * / [NODE_OUTPUT_<uuid>] / [NODE_CHUNK_<uuid>] / [NODE_WAIT_FEEDBACK_BY_<uuid>]
 * 返回 true 表示流结束。
 */
function handleWorkflowEvent(
  eventName: string,
  rawData: string,
  dataObj: AnyObject | null,
): boolean {
  // [START] 携带 wfRuntimeResp JSON，其中 uuid 即 runtimeUuid
  if (eventName === '[START]') {
    if (dataObj?.uuid) {
      wfRuntimeUuid = dataObj.uuid as string;
    }
    return false;
  }

  // [DONE] 流结束
  if (eventName === '[DONE]') {
    console.log('[SSE] 工作流流结束');
    return true;
  }

  // [ERROR]
  if (eventName === '[ERROR]') {
    const errMsg = (dataObj?.msg as string) || rawData || '工作流执行失败';
    const lastMessage = bubbleItems.value[bubbleItems.value.length - 1];
    if (lastMessage) {
      lastMessage.loading = false;
      lastMessage.content += `\n\n> ❌ ${errMsg}`;
      bubbleItems.value = [...bubbleItems.value];
    }
    ElMessage.error(errMsg);
    return true;
  }

  // [NODE_RUN_<uuid>] 节点开始：记录 runtimeNode uuid 映射
  if (eventName.startsWith('[NODE_RUN_')) {
    const nodeUuid = eventName.replace('[NODE_RUN_', '').replace(']', '');
    try {
      const runtimeNode = dataObj ? JSON.parse(rawData) : null;
      if (runtimeNode?.uuid) {
        wfNodeUuidToRuntimeUuid.value[nodeUuid] = runtimeNode.uuid;
      }
      wfNodeEvents.value = [
        ...wfNodeEvents.value,
        {
          key: ++wfNodeKeyCounter,
          nodeUuid,
          nodeTitle: wfNodeUuidToTitle.value[nodeUuid],
          type: 'run',
          data: runtimeNode || rawData,
          timestamp: Date.now(),
        },
      ];
    }
    catch (e) {
      console.warn('[SSE] NODE_RUN 解析失败', e);
    }
    return false;
  }

  // [NODE_CHUNK_<uuid>] LLM 流式文本块：追加到当前 assistant 气泡
  if (eventName.startsWith('[NODE_CHUNK_')) {
    if (rawData) {
      // 去掉后端可能加的多行分隔标记
      const text = rawData.replace(/-_wrap_-/g, '\n');
      handleContentChunk(text);
    }
    return false;
  }

  // [NODE_INPUT_<uuid>] 节点输入
  if (eventName.startsWith('[NODE_INPUT_')) {
    const nodeUuid = eventName.replace('[NODE_INPUT_', '').replace(']', '');
    wfNodeEvents.value = [
      ...wfNodeEvents.value,
      {
        key: ++wfNodeKeyCounter,
        nodeUuid,
        nodeTitle: wfNodeUuidToTitle.value[nodeUuid],
        type: 'input',
        data: dataObj || rawData,
        timestamp: Date.now(),
      },
    ];
    bubbleListRef.value?.scrollToBottom();
    return false;
  }

  // [NODE_OUTPUT_<uuid>] 节点输出
  if (eventName.startsWith('[NODE_OUTPUT_')) {
    const nodeUuid = eventName.replace('[NODE_OUTPUT_', '').replace(']', '');
    wfNodeEvents.value = [
      ...wfNodeEvents.value,
      {
        key: ++wfNodeKeyCounter,
        nodeUuid,
        nodeTitle: wfNodeUuidToTitle.value[nodeUuid],
        type: 'output',
        data: dataObj || rawData,
        timestamp: Date.now(),
      },
    ];
    bubbleListRef.value?.scrollToBottom();
    return false;
  }

  // [NODE_WAIT_FEEDBACK_BY_<uuid>] 人机交互等待输入
  if (eventName.startsWith('[NODE_WAIT_FEEDBACK_BY_')) {
    const tip = rawData || '流程已暂停，请输入内容后继续';
    // 先把当前 assistant 气泡的 loading 关掉
    const lastMessage = bubbleItems.value[bubbleItems.value.length - 1];
    if (lastMessage) {
      lastMessage.loading = false;
      lastMessage.typing = false;
    }
    // 追加一条反馈输入气泡
    bubbleItems.value = [
      ...bubbleItems.value,
      {
        key: bubbleItems.value.length,
        avatar: assistantAvatar,
        avatarSize: '32px',
        maxWidth: '100%',
        role: 'system',
        placement: 'start',
        isMarkdown: false,
        loading: false,
        content: '',
        isWorkflowFeedback: true,
        feedbackTip: tip,
        feedbackValue: '',
        noStyle: true,
      } as MessageItem,
    ];
    bubbleListRef.value?.scrollToBottom();
    return false;
  }

  // 其它未知带方括号事件忽略
  return false;
}

function handleMcpEvent(dataObj: AnyObject) {
  console.log('[SSE] MCP 事件:', dataObj);

  try {
    const parsedContent = typeof dataObj.content === 'string'
      ? JSON.parse(dataObj.content)
      : (dataObj.content || dataObj);
    const content = parsedContent?.tool && typeof parsedContent.tool === 'object'
      ? { ...parsedContent, ...parsedContent.tool }
      : parsedContent;
    const toolName = String(content?.toolName || content?.name
      || (typeof content?.tool === 'string' ? content.tool : '') || 'Hermes 工具');
    const toolId = content?.id || content?.toolId || content?.tool_id;
    const toolStatus = normalizeToolStatus(content?.status || content?.state || 'pending');
    const toolResult = content?.result ?? null;
    const message = bubbleItems.value[bubbleItems.value.length - 1];
    if (!message || message.role !== 'system') {
      return;
    }
    const tools = message.toolCallEvents ? [...message.toolCallEvents] : [];
    const index = tools.findIndex(tool => (toolId && tool.id === toolId)
      || (!toolId && tool.name === toolName && tool.status === 'pending'));
    const toolInfo: ToolCallInfo = {
      key: index >= 0 ? tools[index].key : ++toolCallKeyCounter,
      id: toolId ? String(toolId) : undefined,
      name: toolName,
      status: toolStatus,
      result: toolResult,
      timestamp: Date.now(),
    };
    if (index >= 0) {
      tools[index] = { ...tools[index], ...toolInfo };
    }
    else {
      tools.push(toolInfo);
    }
    message.toolCallEvents = tools;
    message.analysisStatus = 'querying';
    openAnalysisPanel();
    bubbleItems.value = [...bubbleItems.value];
    bubbleListRef.value?.scrollToBottom();
  }
  catch (err) {
    console.error('[SSE] MCP 事件解析失败:', err);
  }
}

function handleContentChunk(content: string) {
  const lastIndex = bubbleItems.value.length - 1;
  const lastMessage = bubbleItems.value[lastIndex];
  if (!lastMessage) {
    return;
  }

  const currentText = filterThinkContent(content);
  if (currentText) {
    lastMessage.content += currentText;
    if (!lastMessage.hasReceivedContent) {
      lastMessage.hasReceivedContent = true;
      markPendingToolsSuccess(lastMessage);
      lastMessage.analysisStatus = 'generating';
      openAnalysisPanel();
    }
  }

  bubbleItems.value = [...bubbleItems.value];
  bubbleListRef.value?.scrollToBottom();
}

function filterThinkContent(content: string): string {
  const openTag = '<think>';
  const closeTag = '</think>';
  let value = pendingThinkTag + content;
  pendingThinkTag = '';
  let visible = '';
  while (value) {
    const tag = isThinking ? closeTag : openTag;
    const index = value.indexOf(tag);
    if (index >= 0) {
      if (!isThinking) {
        visible += value.substring(0, index);
      }
      isThinking = !isThinking;
      value = value.substring(index + tag.length);
      continue;
    }
    const maxPrefix = Math.min(value.length, tag.length - 1);
    let prefixLength = 0;
    for (let length = maxPrefix; length > 0; length--) {
      if (value.endsWith(tag.substring(0, length))) {
        prefixLength = length;
        break;
      }
    }
    const stable = value.substring(0, value.length - prefixLength);
    if (!isThinking) {
      visible += stable;
    }
    pendingThinkTag = value.substring(value.length - prefixLength);
    break;
  }
  return visible;
}

async function cancelSSE() {
  cancel();
  if (bubbleItems.value.length) {
    const lastMessage = bubbleItems.value[bubbleItems.value.length - 1];
    lastMessage.typing = false;
    lastMessage.loading = false;
    finishAssistantAnalysis(lastMessage, 'cancelled');
    bubbleItems.value = [...bubbleItems.value];
  }
  browserVoice.resume();
}

function copyToClipboard(text: string, key: number) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      copyIconMap.value[key] = 'Check';
      setTimeout(() => {
        copyIconMap.value[key] = 'CopyDocument';
      }, 2000);
    })
    .catch((err) => {
      console.error('复制失败:', err);
      ElMessage.error('复制失败，请手动复制');
    });
}

function addMessage(
  message: string,
  isUser: boolean,
  options: Pick<MessageItem, 'requestId' | 'source' | 'toolCallEvents'> = {},
) {
  const i = bubbleItems.value.length;
  const obj: MessageItem = {
    key: i,
    avatar: isUser
      ? avatar.value
      : assistantAvatar,
    avatarSize: '32px',
    maxWidth: isUser ? '68%' : '100%',
    role: isUser ? 'user' : 'system',
    placement: isUser ? 'end' : 'start',
    isMarkdown: !isUser,
    loading: !isUser,
    content: message || '',
    noStyle: !isUser,
    ...(!isUser
      ? {
          analysisStatus: 'analyzing' as const,
          analysisStartedAt: Date.now(),
          hasReceivedContent: false,
        }
      : {}),
    ...options,
  };
  bubbleItems.value.push(obj);
}

function startEditing(item: MessageItem) {
  if (!editingMessageKeys.value.includes(item.key)) {
    editingMessageKeys.value.push(item.key);
    editedContents.value[item.key] = item.content || '';
  }
  item.noStyle = true;
  item.class = 'editing-bubble';
}

function cancelEditingByKey(key: number) {
  const item = bubbleItems.value.find(i => i.key === key);
  if (item) {
    item.noStyle = false;
    item.class = '';
  }
  editingMessageKeys.value = editingMessageKeys.value.filter(k => k !== key);
  delete editedContents.value[key];
}

function sendMessageByKey(key: number) {
  const newContent = editedContents.value[key];
  if (newContent) {
    startSSE(newContent);
    cancelEditingByKey(key);
  }
}
</script>

<template>
  <div class="chat-with-id-container">
    <div class="chat-shell" :class="{ 'analysis-panel-open': analysisPanelOpen }">
      <div class="chat-warp">
        <!-- 工作流节点事件区域 -->
        <Transition name="tool-events-fade">
          <div v-if="hasWfNodeEvents" class="tool-events-wrapper">
            <WfNodeCard
              v-for="evt in wfNodeEvents"
              :key="evt.key"
              :event="evt"
            />
          </div>
        </Transition>

        <BubbleList ref="bubbleListRef" :list="bubbleItems" max-height="calc(100vh - 240px)">
          <template #content="{ item }">
            <!-- 工作流人机交互：输入框气泡 -->
            <div v-if="item.isWorkflowFeedback" class="wf-feedback-bubble">
              <div class="wf-feedback-tip">
                <el-icon style="color: #E6A23C; margin-right: 4px; vertical-align: -2px;">
                  <WarningFilled />
                </el-icon>
                {{ item.feedbackTip || '流程已暂停，请输入内容后继续' }}
              </div>
              <el-input
                v-model="item.feedbackValue"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 5 }"
                placeholder="输入内容后提交，继续执行流程"
              />
              <div class="wf-feedback-actions">
                <el-button type="primary" size="small" @click="submitFeedback(item)">
                  提交并继续
                </el-button>
              </div>
            </div>
            <XMarkdown
              v-else-if="item.content && item.role === 'system'"
              :markdown="item.content"
              :code-x-render="codeXRender"
              class="markdown-body"
              :themes="{ light: 'github-light', dark: 'github-dark' }"
              :default-theme-mode="markdownThemeMode"
            />
            <div v-if="item.content && item.role === 'user'" class="userContent">
              <div class="user-bubble" :class="{ editing: editingMessageKeys.includes(item.key) }">
                <template v-if="!editingMessageKeys.includes(item.key)">
                  <div class="user-content">
                    {{ item.content }}
                  </div>
                </template>

                <template v-else>
                  <div class="edit-card">
                    <el-input
                      v-model="editedContents[item.key]"
                      type="textarea"
                      autosize
                      class="edit-input"
                    />
                    <div class="edit-actions">
                      <el-button size="small" @click="cancelEditingByKey(item.key)">
                        取消
                      </el-button>
                      <el-button type="primary" size="small" @click="sendMessageByKey(item.key)">
                        发送
                      </el-button>
                    </div>
                  </div>
                </template>
              </div>

              <div v-if="!editingMessageKeys.includes(item.key)" class="copy-button-container">
                <el-tooltip content="复制" placement="bottom">
                  <el-button
                    class="copy-btn"
                    :icon="copyIconMap[item.key] || 'CopyDocument'"
                    size="small"
                    @click="copyToClipboard(item.content, item.key)"
                  />
                </el-tooltip>
                <el-tooltip content="编辑" placement="bottom">
                  <el-button class="copy-btn" icon="Edit" size="small" @click="startEditing(item)" />
                </el-tooltip>
              </div>
            </div>
          </template>
        </BubbleList>

        <div class="sender-wrapper">
          <ChatSender
            ref="chatSenderRef"
            v-model="inputValue"
            compact
            :loading="isLoading"
            show-voice-wake
            :voice-enabled="browserVoice.enabled.value"
            :voice-status="browserVoice.status.value"
            :voice-supported="browserVoice.supported.value"
            @submit="startSSE"
            @cancel="cancelSSE"
            @toggle-voice-wake="emit('toggleVoiceWake')"
          />
        </div>
      </div>
      <aside v-if="activeAnalysisMessage" class="analysis-sidebar" :class="{ 'is-collapsed': !analysisPanelOpen }">
        <AnalysisTracePanel
          v-if="analysisPanelOpen"
          :tools="activeAnalysisMessage.toolCallEvents || []"
          :status="activeAnalysisMessage.analysisStatus!"
          :started-at="activeAnalysisMessage.analysisStartedAt"
          @collapse="collapseAnalysisPanel"
        />
        <el-tooltip v-else content="展开分析轨迹" placement="left">
          <button class="analysis-rail" type="button" @click="openAnalysisPanel">
            <el-icon><DataAnalysis /></el-icon>
            <span>{{ analysisPanelLabel }}</span>
          </button>
        </el-tooltip>
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
.user-bubble.editing {
  background: transparent !important;
  padding: 0;
}

.user-bubble {
  max-width: 100%;
  padding: 11px 14px;
  color: #34445c;
  line-height: 1.6;
  background: #f1f4f8;
  border: 1px solid #e6ebf1;
  border-radius: 14px 14px 4px;
}

:deep(.editing-bubble.el-bubble) {
  display: flex !important;
  width: 100% !important;
  justify-content: flex-start !important;
}

:deep(.editing-bubble .el-bubble__content) {
  flex: 1 !important;
  max-width: none !important;
  width: 100% !important;
}

.edit-card {
  width: 500px;
  box-sizing: border-box;
  border: 1px solid #dcdfe6;
  border-radius: 16px;
  padding: 12px;
  background: #ffffff;
  transition: all 0.2s ease;
}

.edit-input :deep(.el-textarea__inner) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  resize: none;
  padding: 0;
  font-size: 14px;
}

.edit-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.copy-button-container {
  position: absolute;
  bottom: -28px;
  right: -10px;
  transform: translateY(10px);
  transition: all 0.3s ease;
  pointer-events: none;
  display: flex;
  justify-content: flex-end;

  .copy-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 16px;
    cursor: pointer;
    pointer-events: auto;
    border: none !important;
    color: #91949a;
    :deep(svg) {
      stroke-width: 3 !important;
    }

    &:hover {
      border-radius: 50%;
      transition: background-color 0.2s;
      background-color: #f1efef;
    }
  }
}

.chat-with-id-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;

  .chat-shell {
    position: relative;
    display: flex;
    width: 100%;
    height: calc(100vh - 60px);
  }

  .chat-warp {
    display: flex;
    min-width: 0;
    flex: 0 1 auto;
    flex-direction: column;
    width: min(1180px, calc(100vw - 64px));
    margin: 0 auto;
    height: 100%;

    .tool-events-wrapper {
      flex: 0 0 auto;
      padding: 4px 12px 0;
    }

    .voice-status-hint {
      position: absolute;
      top: -31px;
      left: 8px;
      z-index: 1;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 9px;
      color: #606266;
      font-size: 13px;
      line-height: 1;
      background: #f4f4f5;
      border-radius: 999px;

      &.voice-status-listening {
        color: #409eff;
        background: #ecf5ff;
      }

      &.voice-status-recognizing,
      &.voice-status-thinking {
        color: #e6a23c;
        background: #fdf6ec;
      }

      &.voice-status-speaking {
        color: #67c23a;
        background: #f0f9eb;
      }
    }

    .tool-events-fade-enter-active,
    .tool-events-fade-leave-active {
      transition: all 0.3s ease;
    }

    .tool-events-fade-enter-from,
    .tool-events-fade-leave-to {
      opacity: 0;
      transform: translateY(-10px);
    }

    .sender-wrapper {
      position: relative;
      width: 100%;
      flex: 0 0 auto;
      margin: 34px 0 22px;
    }
  }

  .analysis-sidebar {
    position: absolute;
    top: 10px;
    left: calc(50% + 608px);
    width: 350px;
    min-width: 350px;
    height: calc(100% - 22px);
    margin: 0;
    transition: width .25s ease, min-width .25s ease;

    &.is-collapsed {
      display: flex;
      align-items: center;
      width: 42px;
      min-width: 42px;
    }
  }

  .analysis-rail {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 42px;
    padding: 12px 7px;
    color: #5a77b5;
    font-size: 11px;
    cursor: pointer;
    background: #f7faff;
    border: 1px solid #dce7fb;
    border-radius: 12px;
    box-shadow: 0 8px 20px rgb(78 115 178 / 10%);

    span { writing-mode: vertical-rl; letter-spacing: .08em; }
  }

  :deep() {
    .el-bubble-list {
      flex: 1;
      min-height: 0;
      padding-top: 28px;
    }
    .el-bubble {
      padding: 0 10px 28px;
    }
    .el-bubble-start .el-bubble-content {
      width: 100%;
      max-width: 100% !important;
    }
    .el-bubble-end .el-bubble-content {
      max-width: 68% !important;
      background: transparent;
      padding: 0;
    }
    .el-bubble-avatar-size .el-avatar {
      border: 1px solid #dce7f7;
      background: #fff;
    }
    .el-typewriter {
      overflow: hidden;
      border-radius: 12px;
    }
    .user-content {
      white-space: pre-wrap;
    }
    .markdown-body {
      background-color: transparent;
      width: 100%;
      max-width: 100%;
      overflow: visible;
    }
    .markdown-elxLanguage-header-div {
      top: -25px !important;
    }
    .elx-xmarkdown-container {
      padding: 8px 4px;
      width: 100%;
      overflow: visible;
    }
  }
}

@media (max-width: 1920px) {
  .chat-with-id-container .chat-shell {
    width: 100%;
  }

  .chat-with-id-container .analysis-sidebar {
    position: absolute;
    top: 8px;
    right: 16px;
    left: auto;
    z-index: 10;
    width: min(350px, calc(100vw - 48px));
    min-width: 0;
    height: calc(100% - 20px);
    margin: 0;

    &.is-collapsed {
      right: -2px;
      width: 42px;
      min-width: 42px;
    }
  }
}

.wf-feedback-bubble {
  width: 100%;
  max-width: 520px;
  padding: 12px;
  border: 1px solid #f0c78a;
  background: #fdf6ec;
  border-radius: 12px;

  .wf-feedback-tip {
    font-size: 13px;
    color: #b88230;
    margin-bottom: 8px;
    line-height: 1.6;
  }

  .wf-feedback-actions {
    margin-top: 8px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
