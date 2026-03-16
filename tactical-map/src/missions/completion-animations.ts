/**
 * Completion Animations — Phase 5.5
 *
 * Celebration and transition animations for mission lifecycle events.
 * Includes:
 * - Mission completion burst (particle explosion)
 * - Phase transition ripple effect
 * - Error shake animation
 * - Card appear/disappear fades
 * - Floating bob animation
 * - Progress tick animation
 *
 * All animations are frame-based, update via requestAnimationFrame,
 * and are designed to hit 60fps with up to 50 active missions.
 */

import type { Animation, AnimationType, Point } from './types';

// ═══════════════════════════════════════════
// Animation Manager
// ═══════════════════════════════════════════

export class AnimationManager {
  private animations: Map<string, Animation> = new Map();
  private idCounter = 0;

  /** Maximum concurrent animations for performance */
  private readonly maxAnimations: number;

  constructor(maxAnimations = 100) {
    this.maxAnimations = maxAnimations;
  }

  /**
   * Create a new animation. Returns the animation ID.
   * If at capacity, drops the oldest non-critical animation.
   */
  create(
    type: AnimationType,
    targetId: string,
    duration: number,
    params: Record<string, number | string> = {}
  ): string {
    // Enforce capacity
    if (this.animations.size >= this.maxAnimations) {
      this.pruneOldest();
    }

    const id = `anim-${++this.idCounter}`;
    const animation: Animation = {
      id,
      type,
      targetId,
      startTime: performance.now(),
      duration,
      progress: 0,
      params,
    };

    this.animations.set(id, animation);
    return id;
  }

  /**
   * Update all animations. Call once per frame.
   * Returns list of active animations for rendering.
   */
  update(now: number = performance.now()): Animation[] {
    const active: Animation[] = [];
    const toRemove: string[] = [];

    for (const [id, anim] of this.animations) {
      const elapsed = now - anim.startTime;
      anim.progress = Math.min(elapsed / anim.duration, 1);

      if (anim.progress >= 1) {
        toRemove.push(id);
      } else {
        active.push(anim);
      }
    }

    for (const id of toRemove) {
      this.animations.delete(id);
    }

    return active;
  }

  /**
   * Remove a specific animation by ID.
   */
  remove(id: string): void {
    this.animations.delete(id);
  }

  /**
   * Remove all animations for a target.
   */
  removeByTarget(targetId: string): void {
    for (const [id, anim] of this.animations) {
      if (anim.targetId === targetId) {
        this.animations.delete(id);
      }
    }
  }

  /**
   * Check if any animation is active for a target.
   */
  hasActiveAnimation(targetId: string): boolean {
    for (const anim of this.animations.values()) {
      if (anim.targetId === targetId) return true;
    }
    return false;
  }

  /**
   * Get current animation count.
   */
  get count(): number {
    return this.animations.size;
  }

  /**
   * Clear all animations.
   */
  clear(): void {
    this.animations.clear();
  }

  private pruneOldest(): void {
    let oldest: [string, Animation] | null = null;
    for (const entry of this.animations) {
      if (!oldest || entry[1].startTime < oldest[1].startTime) {
        oldest = entry;
      }
    }
    if (oldest) {
      this.animations.delete(oldest[0]);
    }
  }
}

// ═══════════════════════════════════════════
// Particle System (for completion bursts)
// ═══════════════════════════════════════════

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0-1, decreasing
  color: string;
  size: number;
}

/**
 * Generate particles for a completion burst at the given position.
 */
export function createCompletionParticles(
  center: Point,
  count: number = 24,
  colors: string[] = ['#AED581', '#81C784', '#4CAF50', '#FFD54F', '#4FC3F7']
): Particle[] {
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
    const speed = 40 + Math.random() * 80;

    particles.push({
      x: center.x,
      y: center.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20, // slight upward bias
      life: 1,
      color: colors[i % colors.length],
      size: 2 + Math.random() * 3,
    });
  }

  return particles;
}

/**
 * Update particle positions and life. Returns surviving particles.
 */
export function updateParticles(
  particles: Particle[],
  deltaSeconds: number,
  gravity: number = 80
): Particle[] {
  const surviving: Particle[] = [];

  for (const p of particles) {
    p.x += p.vx * deltaSeconds;
    p.y += p.vy * deltaSeconds;
    p.vy += gravity * deltaSeconds;
    p.life -= deltaSeconds * 1.2;
    p.size *= 0.995;

    if (p.life > 0 && p.size > 0.3) {
      surviving.push(p);
    }
  }

  return surviving;
}

/**
 * Render particles to canvas.
 */
export function renderParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[]
): void {
  ctx.save();

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ═══════════════════════════════════════════
// Easing Functions
// ═══════════════════════════════════════════

export function easeOutCubic(t: number): number {
  const t1 = t - 1;
  return t1 * t1 * t1 + 1;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

export function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;

  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75;
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
}

// ═══════════════════════════════════════════
// Animation Renderers
// ═══════════════════════════════════════════

/**
 * Apply animation transforms to a canvas context.
 * Call before rendering the animated element.
 * Returns any adjustments (offset, scale, opacity) to apply.
 */
export function applyAnimation(
  animation: Animation
): { offsetX: number; offsetY: number; scale: number; opacity: number } {
  const { type, progress, params } = animation;

  switch (type) {
    case 'card_appear':
      return {
        offsetX: 0,
        offsetY: (1 - easeOutCubic(progress)) * -20,
        scale: 0.8 + easeOutElastic(progress) * 0.2,
        opacity: easeOutCubic(progress),
      };

    case 'card_disappear':
      return {
        offsetX: 0,
        offsetY: easeInOutCubic(progress) * 30,
        scale: 1 - easeInOutCubic(progress) * 0.3,
        opacity: 1 - easeInOutCubic(progress),
      };

    case 'phase_transition': {
      const rippleScale = 1 + easeOutCubic(progress) * 0.1;
      return {
        offsetX: 0,
        offsetY: 0,
        scale: rippleScale,
        opacity: 1,
      };
    }

    case 'completion_burst':
      return {
        offsetX: 0,
        offsetY: 0,
        scale: 1 + easeOutBounce(progress) * 0.15,
        opacity: 1,
      };

    case 'error_shake': {
      const shakeIntensity = (1 - progress) * 6;
      const shakeX = Math.sin(progress * Math.PI * 8) * shakeIntensity;
      return {
        offsetX: shakeX,
        offsetY: 0,
        scale: 1,
        opacity: 1,
      };
    }

    case 'progress_tick':
      return {
        offsetX: 0,
        offsetY: 0,
        scale: 1 + (1 - easeOutCubic(progress)) * 0.05,
        opacity: 1,
      };

    case 'float_bob': {
      const amplitude = Number(params['amplitude'] ?? 3);
      return {
        offsetX: 0,
        offsetY: Math.sin(progress * Math.PI * 2) * amplitude,
        scale: 1,
        opacity: 1,
      };
    }

    default:
      return { offsetX: 0, offsetY: 0, scale: 1, opacity: 1 };
  }
}

/**
 * Render a phase transition ripple effect at a position.
 */
export function renderPhaseTransitionRipple(
  ctx: CanvasRenderingContext2D,
  center: Point,
  progress: number,
  color: string
): void {
  if (progress >= 1) return;

  const maxRadius = 60;
  const radius = easeOutCubic(progress) * maxRadius;
  const alpha = (1 - progress) * 0.4;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * (1 - progress);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner glow
  ctx.globalAlpha = alpha * 0.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
