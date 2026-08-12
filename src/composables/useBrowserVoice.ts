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
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const WAKE_WORD = '小智同学';
const COMMAND_TIMEOUT = 8000;

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

function normalizeText(text: string): string {
  return text.replace(/[\s，。！？、；：,.!?;:]/g, '');
}

/**
 * Browser-native wake-word recognition. It intentionally only handles the
 * microphone lifecycle and emits a completed command to the Chat page.
 */
export function useBrowserVoice() {
  const enabled = ref(false);
  const status = ref<BrowserVoiceStatus>('OFF');
  const supported = computed(() => Boolean(getRecognitionConstructor()));
  const errorMessage = ref('');

  let recognition: BrowserSpeechRecognition | null = null;
  let recognitionStarted = false;
  let shouldListen = false;
  let commandTimer: number | undefined;
  let commandHandler: ((text: string) => void) | undefined;

  function clearCommandTimer() {
    if (commandTimer !== undefined) {
      window.clearTimeout(commandTimer);
      commandTimer = undefined;
    }
  }

  function stopRecognition() {
    if (!recognitionStarted || !recognition) {
      return;
    }
    try {
      recognition.stop();
    }
    catch {
      // A recognition instance may already have stopped before its onend event.
    }
  }

  function startRecognition() {
    if (!enabled.value || !shouldListen || status.value === 'THINKING' || document.hidden) {
      return;
    }
    if (!recognition) {
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
      recognition.interimResults = false;
      recognition.onstart = () => {
        recognitionStarted = true;
      };
      recognition.onend = () => {
        recognitionStarted = false;
        if (enabled.value && shouldListen && status.value !== 'THINKING') {
          window.setTimeout(startRecognition, 150);
        }
      };
      recognition.onerror = (event) => {
        if (event.error === 'aborted' || event.error === 'no-speech') {
          return;
        }
        shouldListen = false;
        enabled.value = false;
        clearCommandTimer();
        status.value = 'ERROR';
        errorMessage.value = event.message || `语音识别不可用：${event.error}`;
      };
      recognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result.isFinal) {
            handleRecognizedText(result[0]?.transcript || '');
          }
        }
      };
    }
    if (recognitionStarted) {
      return;
    }
    try {
      // Mark it started before start() so repeated resume/onend calls do not throw InvalidStateError.
      recognitionStarted = true;
      recognition.start();
    }
    catch {
      recognitionStarted = false;
    }
  }

  function waitForCommand() {
    status.value = 'LISTENING_COMMAND';
    clearCommandTimer();
    commandTimer = window.setTimeout(() => {
      if (enabled.value && status.value === 'LISTENING_COMMAND') {
        status.value = 'WAITING_WAKE';
      }
    }, COMMAND_TIMEOUT);
  }

  function emitCommand(command: string) {
    clearCommandTimer();
    shouldListen = false;
    status.value = 'THINKING';
    stopRecognition();
    commandHandler?.(command);
  }

  function handleRecognizedText(text: string) {
    if (!enabled.value || status.value === 'THINKING') {
      return;
    }
    const normalized = normalizeText(text);
    if (!normalized) {
      return;
    }

    const wakeWordIndex = normalized.indexOf(WAKE_WORD);
    if (status.value === 'WAITING_WAKE') {
      if (wakeWordIndex < 0) {
        return;
      }
      const command = normalized.slice(wakeWordIndex + WAKE_WORD.length);
      if (command) {
        emitCommand(command);
      }
      else {
        waitForCommand();
      }
      return;
    }

    if (status.value === 'LISTENING_COMMAND') {
      if (wakeWordIndex >= 0) {
        const command = normalized.slice(wakeWordIndex + WAKE_WORD.length);
        if (command) {
          emitCommand(command);
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
    clearCommandTimer();
    status.value = 'OFF';
    stopRecognition();
  }

  function pause() {
    if (!enabled.value) {
      return;
    }
    shouldListen = false;
    clearCommandTimer();
    status.value = 'THINKING';
    stopRecognition();
  }

  function resume() {
    if (!enabled.value) {
      return;
    }
    shouldListen = true;
    clearCommandTimer();
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
