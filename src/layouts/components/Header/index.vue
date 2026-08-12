<!-- Header 头部 -->
<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core';
import brandLogo from '@/assets/images/logo.png';
import { SIDE_BAR_WIDTH } from '@/config/index';
import { useDesignStore, useUserStore } from '@/stores';
import { useSessionStore } from '@/stores/modules/session';
import Avatar from './components/Avatar.vue';
import Collapse from './components/Collapse.vue';
import CreateChat from './components/CreateChat.vue';
import LoginBtn from './components/LoginBtn.vue';
import TitleEditing from './components/TitleEditing.vue';

const userStore = useUserStore();
const designStore = useDesignStore();
const sessionStore = useSessionStore();

const currentSession = computed(() => sessionStore.currentSession);

onMounted(() => {
  // 全局设置侧边栏默认宽度 (这个是不变的，一开始就设置)
  document.documentElement.style.setProperty(`--sidebar-default-width`, `${SIDE_BAR_WIDTH}px`);
  if (designStore.isCollapse) {
    document.documentElement.style.setProperty(`--sidebar-left-container-default-width`, ``);
  }
  else {
    document.documentElement.style.setProperty(
      `--sidebar-left-container-default-width`,
      `${SIDE_BAR_WIDTH}px`,
    );
  }
});

// 定义 Ctrl+K 的处理函数
function handleCtrlK(event: KeyboardEvent) {
  event.preventDefault(); // 防止默认行为
  sessionStore.createSessionBtn();
}

// 设置全局的键盘按键监听
onKeyStroke(event => event.ctrlKey && event.key.toLowerCase() === 'k', handleCtrlK, {
  passive: false,
});
</script>

<template>
  <div class="header-container">
    <div class="header-box relative z-10 top-0 left-0 right-0">
      <div class="absolute left-0 right-0 top-0 bottom-0 flex items-center flex-row">
        <div
          class="overflow-hidden flex h-full items-center flex-row flex-1 w-fit flex-shrink-0 min-w-0"
        >
          <div class="w-full flex items-center flex-row">
            <!-- 左边 -->
            <div
              v-if="designStore.isCollapse"
              class="left-box flex h-full items-center pl-20px gap-12px flex-shrink-0 flex-row"
            >
              <Collapse />
              <CreateChat />
              <div v-if="currentSession" class="w-0.5px h-30px bg-[rgba(217,217,217)]" />
              <div class="header-brand">
                <span class="header-brand-mark">
                  <img :src="brandLogo" alt="MSPIC-AI">
                </span>
                <span class="header-brand-copy">
                  <strong>MSPIC-AI</strong>
                  <small>DCMA 工业运行诊断系统 · 基于 Agent 的智能分析</small>
                </span>
              </div>
            </div>

            <!-- 中间 -->
            <div class="middle-box flex-1 min-w-0 ml-12px">
              <TitleEditing />
            </div>
          </div>
        </div>

        <!-- 右边 -->
        <div class="right-box flex h-full items-center pr-20px flex-shrink-0 mr-auto flex-row">
          <Avatar v-show="userStore.token" />
          <LoginBtn v-show="!userStore.token" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.header-container {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  width: 100%;
  height: fit-content;
  .header-box {
    width: 100%;
    width: calc(
      100% - var(--sidebar-left-container-default-width, 0px) - var(
          --sidebar-right-container-default-width,
          0px
        )
    );
    height: var(--header-container-default-heigth);
    margin: 0 var(--sidebar-right-container-default-width, 0) 0
      var(--sidebar-left-container-default-width, 0);
  }
}

.header-brand {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.header-brand-mark {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e1e9f7;
  border-radius: 10px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 17% center;
  }
}

.header-brand-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;

  strong {
    color: #193c7c;
    font-size: 15px;
    font-weight: 700;
  }

  small {
    max-width: 310px;
    margin-top: 3px;
    overflow: hidden;
    color: #7b8797;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
