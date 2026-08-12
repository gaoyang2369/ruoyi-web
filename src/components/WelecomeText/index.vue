<!-- 新对话欢迎文案：品牌固定在页面左上角，首屏只保留任务引导。 -->
<script setup lang="ts">
import { useTimeGreeting } from '@/hooks/useTimeGreeting';

const greeting = useTimeGreeting();
</script>

<template>
  <section class="welcome-text">
    <h1>{{ greeting }}好，我是 MSPIC-AI</h1>
    <p>基于设备实时运行数据、故障手册与诊断工具，可协助进行运行分析、故障诊断、知识查询和报告生成。</p>
  </section>
</template>

<style scoped lang="scss">
.welcome-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: 0 0 16px;
  text-align: center;
}

h1 {
  margin: 0;
  color: #1d293d;
  font-size: clamp(26px, 3vw, 34px);
  font-weight: 700;
  line-height: 1.28;
  letter-spacing: -0.02em;
}

p {
  max-width: 680px;
  margin: 10px 0 0;
  color: #66758a;
  font-size: 14px;
  line-height: 1.75;
}

@media (max-width: 640px) {
  p {
    font-size: 13px;
  }
}
</style>
