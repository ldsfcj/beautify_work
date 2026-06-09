<template>
  <div
    ref="root"
    class="compare-slider"
    :style="{ aspectRatio: aspectRatio }"
  >
    <img :src="leftSrc" class="layer" alt="before" draggable="false" />
    <!-- Right (result) is clipped by an inset; we update --clip from JS. -->
    <img
      :src="rightSrc"
      class="layer right"
      alt="after"
      draggable="false"
      :style="{ clipPath: clipPath }"
    />
    <div class="divider" :style="{ left: position + '%' }">
      <div class="handle" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp">
        <van-icon name="swap" size="16" color="#fff" />
      </div>
    </div>
    <div class="label left">原图</div>
    <div class="label right">预览</div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  leftSrc: { type: String, required: true },
  rightSrc: { type: String, required: true },
  /** Initial handle position (0-100). */
  initial: { type: Number, default: 50 },
  /** Resolved at runtime from the loaded image; falls back to 1:1. */
  aspectRatio: { type: String, default: '1 / 1' },
});

const root = ref(null);
const position = ref(props.initial);
const aspectRatio = ref(props.aspectRatio);
const dragging = ref(false);

const clipPath = computed(() => `inset(0 0 0 ${position.value}%)`);

const onDown = (e) => {
  dragging.value = true;
  e.target.setPointerCapture?.(e.pointerId);
};

const onMove = (e) => {
  if (!dragging.value) return;
  updateFromClientX(e.clientX);
};

const onUp = (e) => {
  dragging.value = false;
  e.target.releasePointerCapture?.(e.pointerId);
};

const updateFromClientX = (clientX) => {
  if (!root.value) return;
  const rect = root.value.getBoundingClientRect();
  const x = clientX - rect.left;
  const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
  position.value = pct;
};

// Global fallback for pointermove when the pointer leaves the handle.
const onWindowMove = (e) => {
  if (!dragging.value) return;
  updateFromClientX(e.clientX);
};
const onWindowUp = () => {
  dragging.value = false;
};

onMounted(() => {
  window.addEventListener('pointermove', onWindowMove);
  window.addEventListener('pointerup', onWindowUp);
  // Resolve the aspect ratio of the left image so the wrapper keeps
  // its native shape (avoids letterboxing the smaller side).
  const img = new Image();
  img.onload = () => {
    if (img.width && img.height) {
      aspectRatio.value = `${img.width} / ${img.height}`;
    }
  };
  img.src = props.leftSrc;
});

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onWindowMove);
  window.removeEventListener('pointerup', onWindowUp);
});
</script>

<style scoped>
.compare-slider {
  position: relative;
  width: 100%;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  user-select: none;
  touch-action: none;
}
.layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
.layer.right {
  /* Clipped by inline style; CSS clip-path needs a fallback for old browsers. */
  z-index: 1;
}
.divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #fff;
  transform: translateX(-50%);
  z-index: 2;
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
}
.handle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--van-primary-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ew-resize;
  pointer-events: auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.label {
  position: absolute;
  top: 8px;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  padding: 2px 8px;
  border-radius: 4px;
  z-index: 3;
  pointer-events: none;
}
.label.left {
  left: 8px;
}
.label.right {
  right: 8px;
}
</style>
