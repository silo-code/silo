<script setup>
import DefaultTheme from "vitepress/theme";
const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #home-features-before>
      <div class="demo-video">
        <video autoplay loop muted playsinline>
          <source src="/demo.mp4" type="video/mp4" />
        </video>
      </div>
    </template>
  </Layout>
</template>

<style>
.demo-video {
  padding: 0 24px;
  margin: 2rem 0 3.5rem;
  box-sizing: border-box;
}
@media (min-width: 640px) {
  .demo-video {
    padding: 0 48px;
  }
}
@media (min-width: 960px) {
  .demo-video {
    padding: 0 64px;
  }
}
.demo-video video {
  max-width: 1152px;
  width: 100%;
  display: block;
  margin: 0 auto;
  border-radius: 8px;
}
</style>
