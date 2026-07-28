<script setup>
import { ref, onMounted } from "vue";

const REPO = "silo-code/silo";
const CACHE_KEY = "silo-docs-github-stars";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour, to stay well under the unauthenticated GitHub API rate limit.

const stars = ref(null);

function formatStars(count) {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

onMounted(async () => {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null");
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      stars.value = cached.count;
      return;
    }
  } catch {
    // Ignore malformed cache entries and fall through to a fresh fetch.
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`);
    if (!res.ok) return;
    const data = await res.json();
    stars.value = data.stargazers_count;
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ count: stars.value, at: Date.now() }),
    );
  } catch {
    // Offline or rate-limited: leave the badge icon-only.
  }
});
</script>

<template>
  <a
    class="github-stars"
    :href="`https://github.com/${REPO}`"
    target="_blank"
    rel="noopener"
    aria-label="Star silo-code/silo on GitHub"
  >
    <svg
      class="github-stars-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
        0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
        -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
        .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
        -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
        1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
        1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01
        1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
    <span v-if="stars !== null" class="github-stars-count">{{
      formatStars(stars)
    }}</span>
  </a>
</template>

<style scoped>
.github-stars {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  margin-left: 16px;
  border-radius: 999px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: background-color 0.2s;
}
.github-stars:hover {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-1);
}
.github-stars-icon {
  flex-shrink: 0;
}
.github-stars-count {
  font-size: 13px;
  font-weight: 600;
  color: #b45309;
}

.dark .github-stars-count {
  color: #f0a742;
}
</style>
