import * as THREE from 'three';

/**
 * Creates a floating 3D text badge using high-resolution Canvas 2D texture.
 * Used to display live queue counts above each arm's stop line.
 */
export class QueueBadge {
  constructor(arm, position, isAdaptive = false) {
    this.arm = arm; // 'N', 'E', 'S', or 'W'
    this.count = 0;
    this.isAdaptive = isAdaptive;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false
    });

    this.sprite = new THREE.Sprite(spriteMat);
    this.sprite.position.copy(position);
    this.sprite.scale.set(6.5, 3.25, 1.0);
    this.sprite.renderOrder = 999;

    this.updateTexture();
  }

  setCount(newCount) {
    if (this.count === newCount) return;
    this.count = newCount;
    this.updateTexture();
  }

  updateTexture() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 256, 128);

    // Rounded badge background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 128);
    if (this.isAdaptive) {
      bgGrad.addColorStop(0, 'rgba(6, 78, 59, 0.92)');
      bgGrad.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
    } else {
      bgGrad.addColorStop(0, 'rgba(120, 53, 15, 0.92)');
      bgGrad.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
    }

    ctx.fillStyle = bgGrad;
    ctx.strokeStyle = this.isAdaptive ? '#10b981' : '#f59e0b';
    ctx.lineWidth = 4;

    this.roundRect(ctx, 8, 8, 240, 112, 24);
    ctx.fill();
    ctx.stroke();

    // Text header (Arm ID)
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 26px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`ARM ${this.arm}`, 128, 44);

    // Live Queue count
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px "JetBrains Mono", monospace';
    ctx.fillText(`Q: ${this.count}`, 128, 96);

    this.texture.needsUpdate = true;
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

/**
 * Creates the set of 4 floating queue badges for a junction.
 */
export function buildJunctionQueueBadges(junctionCenter, isAdaptive = false) {
  const armOffsets = {
    N: { x: -3.5, y: 7.2, z: -11.0 },
    S: { x: 3.5,  y: 7.2, z: 11.0 },
    E: { x: 11.0, y: 7.2, z: -3.5 },
    W: { x: -11.0, y: 7.2, z: 3.5 }
  };

  const badges = {};
  const group = new THREE.Group();
  group.name = `QueueBadges_${isAdaptive ? 'Adaptive' : 'Fixed'}`;

  ['N', 'E', 'S', 'W'].forEach(arm => {
    const pos = new THREE.Vector3(
      junctionCenter.x + armOffsets[arm].x,
      armOffsets[arm].y,
      junctionCenter.z + armOffsets[arm].z
    );
    const badge = new QueueBadge(arm, pos, isAdaptive);
    badges[arm] = badge;
    group.add(badge.sprite);
  });

  return { badges, group };
}
