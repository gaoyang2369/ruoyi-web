import { computed, ref } from 'vue';

export type BrowserVoiceStatus = 'OFF' | 'WAITING_WAKE' | 'LISTENING_COMMAND' | 'THINKING' | 'ERROR';

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface RecognitionResultEvent extends Event {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const WAKE_WORD = '小智同学';
const COMMAND_START_TIMEOUT = 15000;
const RECOVERABLE_ERRORS = new Set(['aborted', 'no-speech']);
const UNRECOVERABLE_ERRORS = new Set(['audio-capture', 'not-allowed', 'service-not-allowed']);

function getRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const browserWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
}

/** Only correct known wake-word and equipment-code recognition variants. */
function correctKnownTerms(text: string): string {
  return text
    .replace(/小[志知]同学/g, WAKE_WORD)
    .replace(/g(?:一二零|幺二零)/gi, 'G120')
    .replace(/a零七零八九/gi, 'A07089')
    .replace(/f三零八九九/gi, 'F30899');
}

function normalizeText(text: string): string {
  return correctKnownTerms(text).replace(/[\s，。！？、；：,.!?;:]/g, '');
}

/**
 * Browser-native wake-word recognition. It manages only microphone state and
 * emits completed commands; the Chat page owns how commands are sent.
 */
export function useBrowserVoice() {
  const enabled = ref(false);
  const status = ref<BrowserVoiceStatus>('OFF');
  const supported = computed(() => Boolean(getRecognitionConstructor()));
  const errorMessage = ref('');

  let recognition: BrowserSpeechRecognition | null = null;
  let startPending = false;
  let running = false;
  let shouldListen = false;
  let commandStartTimer: number | undefined;
  let restartTimer: number | undefined;
  let commandHandler: ((text: string) => void) | undefined;

  function clearCommandStartTimer() {
    if (commandStartTimer !== undefined) {
      window.clearTimeout(commandStartTimer);
      commandStartTimer = undefined;
    }
  }

  function clearRestartTimer() {
    if (restartTimer !== undefined) {
      window.clearTimeout(restartTimer);
      restartTimer = undefined;
    }
  }

  function canListen() {
    return enabled.value && shouldListen && status.value !== 'THINKING' && !document.hidden;
  }

  function scheduleRestart() {
    if (!canListen() || restartTimer !== undefined) {
      return;
    }
    restartTimer = window.setTimeout(() => {
      restartTimer = undefined;
      startRecognition();
    }, 150);
  }

  function stopRecognition() {
    clearRestartTimer();
    if (!recognition || (!running && !startPending)) {
      return;
    }
    try {
      recognition.stop();
    }
    catch {
      // The browser may already be ending this recognition session.
    }
  }

  function createRecognition() {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      enabled.value = false;
      status.value = 'ERROR';
      errorMessage.value = '当前浏览器不支持语音识别';
      return;
    }

    recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      startPending = false;
      running = true;
    };
    recognition.onend = () => {
      startPending = false;
      running = false;
      scheduleRestart();
    };
    recognition.onspeechstart = () => {
      if (status.value === 'LISTENING_COMMAND') {
        clearCommandStartTimer();
      }
    };
    recognition.onspeechend = () => {
      // Command dispatch remains final-result based, so interim text is never sent.
    };
    recognition.onerror = (event) => {
      if (RECOVERABLE_ERRORS.has(event.error)) {
        return;
      }
      if (UNRECOVERABLE_ERRORS.has(event.error)) {
        enabled.value = false;
        shouldListen = false;
        clearCommandStartTimer();
        clearRestartTimer();
        status.value = 'ERROR';
        errorMessage.value = event.message || `语音识别不可用：${event.error}`;
        return;
      }
      // Other browser-recognition errors are retried from onend.
      errorMessage.value = event.message || `语音识别暂时不可用：${event.error}`;
    };
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript || '';
        if (result.isFinal) {
          handleFinalText(text);
        }
        else {
          handleInterimText(text);
        }
      }
    };
  }

  function startRecognition() {
    if (!canListen() || running || startPending) {
      return;
    }
    if (!recognition) {
      createRecognition();
    }
    if (!recognition || !canListen() || running || startPending) {
      return;
    }

    try {
      startPending = true;
      recognition.start();
    }
    catch {
      startPending = false;
      scheduleRestart();
    }
  }

  function waitForCommand() {
    status.value = 'LISTENING_COMMAND';
    clearCommandStartTimer();
    commandStartTimer = window.setTimeout(() => {
      if (enabled.value && status.value === 'LISTENING_COMMAND') {
        status.value = 'WAITING_WAKE';
      }
    }, COMMAND_START_TIMEOUT);
  }

  function emitCommand(command: string) {
    clearCommandStartTimer();
    shouldListen = false;
    status.value = 'THINKING';
    stopRecognition();
    commandHandler?.(command);
  }

  function extractWakeCommand(text: string): string | undefined {
    const wakeWordIndex = text.indexOf(WAKE_WORD);
    return wakeWordIndex >= 0 ? text.slice(wakeWordIndex + WAKE_WORD.length) : undefined;
  }

  function handleInterimText(text: string) {
    if (!enabled.value || status.value !== 'WAITING_WAKE') {
      return;
    }
    if (extractWakeCommand(normalizeText(text)) !== undefined) {
      // Wake early for UI responsiveness; only final recognition can submit a command.
      waitForCommand();
    }
  }

  function handleFinalText(text: string) {
    if (!enabled.value || status.value === 'THINKING') {
      return;
    }
    const normalized = normalizeText(text);
    if (!normalized) {
      return;
    }
    const wakeCommand = extractWakeCommand(normalized);

    if (status.value === 'WAITING_WAKE') {
      if (wakeCommand === undefined) {
        return;
      }
      if (wakeCommand) {
        emitCommand(wakeCommand);
      }
      else {
        waitForCommand();
      }
      return;
    }

    if (status.value === 'LISTENING_COMMAND') {
      if (wakeCommand !== undefined) {
        if (wakeCommand) {
          emitCommand(wakeCommand);
        }
        else {
          waitForCommand();
        }
        return;
      }
      emitCommand(normalized);
    }
  }

  function enable() {
    if (!supported.value) {
      status.value = 'ERROR';
      errorMessage.value = '当前浏览器不支持语音识别';
      return;
    }
    enabled.value = true;
    shouldListen = true;
    errorMessage.value = '';
    status.value = 'WAITING_WAKE';
    startRecognition();
  }

  function disable() {
    enabled.value = false;
    shouldListen = false;
    clearCommandStartTimer();
    status.value = 'OFF';
    stopRecognition();
  }

  function pause() {
    if (!enabled.value) {
      return;
    }
    shouldListen = false;
    clearCommandStartTimer();
    status.value = 'THINKING';
    stopRecognition();
  }

  function resume() {
    if (!enabled.value) {
      return;
    }
    shouldListen = true;
    clearCommandStartTimer();
    status.value = 'WAITING_WAKE';
    startRecognition();
  }

  function onCommand(handler: (text: string) => void) {
    commandHandler = handler;
    return () => {
      if (commandHandler === handler) {
        commandHandler = undefined;
      }
    };
  }

  return {
    enabled,
    status,
    supported,
    errorMessage,
    enable,
    disable,
    pause,
    resume,
    onCommand,
  };
}

export type BrowserVoice = ReturnType<typeof useBrowserVoice>;
