<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useBrowserVoice } from '@/composables/useBrowserVoice';
import ChatDefaul from '@/pages/chat/layouts/chatDefaul/index.vue';
import ChatWithId from '@/pages/chat/layouts/chatWithId/index.vue';

const route = useRoute();
const sessionId = computed(() => route.params?.id);
const browserVoice = useBrowserVoice();
let resumeAfterVisible = false;

function toggleVoiceWake() {
  if (browserVoice.enabled.value) {
    browserVoice.disable();
  }
  else {
    browserVoice.enable();
  }
}

function handleVisibilityChange() {
  if (document.hidden) {
    resumeAfterVisible = browserVoice.enabled.value && browserVoice.status.value !== 'THINKING';
    browserVoice.pause();
  }
  else if (resumeAfterVisible) {
    resumeAfterVisible = false;
    browserVoice.resume();
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  browserVoice.disable();
});
</script>

<template>
  <div class="chat-container">
    <!-- 默认聊天页面 -->
    <ChatDefaul
      v-if="!sessionId"
      :voice="browserVoice"
      @toggle-voice-wake="toggleVoiceWake"
    />
    <!-- 带id的聊天页面 -->
    <ChatWithId
      v-else
      :voice="browserVoice"
      @toggle-voice-wake="toggleVoiceWake"
    />
  </div>
</template>

<style lang="scss" scoped>
.chat-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: calc(100% - 32px);
  height: 100%;
  padding: 0 16px;
  overflow-anchor: none;
}
</style>
