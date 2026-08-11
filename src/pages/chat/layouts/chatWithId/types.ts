/**
 * 工具调用信息类型定义
 */
export interface ToolCallInfo {
  /** 唯一标识 key */
  key?: number;
  /** 后端工具调用标识，用于合并同一工具的进度事件 */
  id?: string;
  /** 工具名称 */
  name: string;
  /** 调用状态: pending-调用中, success-成功, error-失败 */
  status: 'pending' | 'success' | 'error';
  /** 调用结果 */
  result: string | null;
  /** 调用时间戳 */
  timestamp: number;
}

/** Windows Voice Client 与聊天页同步通道事件 */
export type ChatSyncEventType
  = | 'USER_MESSAGE'
    | 'TOOL_PROGRESS'
    | 'ASSISTANT_DELTA'
    | 'ASSISTANT_DONE'
    | 'VOICE_STATUS';

/** 语音会话状态 */
export type VoiceStatus = 'IDLE' | 'LISTENING' | 'RECOGNIZING' | 'THINKING' | 'SPEAKING';

/**
 * /chat/sync/ws 的事件体。
 * 后端可把业务字段放在 data 或 payload 中，页面会在接收时展开这两层数据。
 */
export interface ChatSyncEvent {
  type?: ChatSyncEventType | string;
  event?: ChatSyncEventType | string;
  requestId?: string;
  request_id?: string;
  clientRequestId?: string;
  client_request_id?: string;
  source?: string;
  content?: string;
  delta?: string;
  message?: string;
  status?: VoiceStatus | string;
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * 工作流节点事件（输入/输出/运行）类型定义
 */
export interface WfNodeEvent {
  /** 唯一标识 key */
  key: number;
  /** 节点 uuid */
  nodeUuid: string;
  /** 节点标题 */
  nodeTitle?: string;
  /** 事件类型 */
  type: 'input' | 'output' | 'run';
  /** 数据载荷 */
  data: any;
  /** 时间戳 */
  timestamp: number;
}
