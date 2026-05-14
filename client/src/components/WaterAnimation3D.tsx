import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

// 彩虹七色（每轮循环完成后切换）
const RAINBOW_COLORS = [
  { r: 1.0, g: 0.15, b: 0.1 },   // 红
  { r: 1.0, g: 0.5,  b: 0.0 },   // 橙
  { r: 1.0, g: 0.9,  b: 0.0 },   // 黄
  { r: 0.1, g: 0.85, b: 0.2 },   // 绿
  { r: 0.0, g: 0.8,  b: 0.9 },   // 青
  { r: 0.1, g: 0.3,  b: 1.0 },   // 蓝
  { r: 0.6, g: 0.1,  b: 1.0 },   // 紫
];

interface Ripple {
  x: number;
  z: number;
  age: number;
  maxAge: number;
  strength: number;
}

interface Droplet {
  x: number;
  z: number;
  y: number;
  vy: number;
  active: boolean;
  splashed: boolean;
}

const WaterAnimation3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const colorIdxRef = useRef(0);
  const fillRef = useRef(0); // 0~1 水位进度
  const ripplesRef = useRef<Ripple[]>([]);
  const dropletsRef = useRef<Droplet[]>([]);
  const dropTimerRef = useRef(0);
  const DROP_INTERVAL = 0.8; // 秒
  const colorTransRef = useRef({ from: RAINBOW_COLORS[0], to: RAINBOW_COLORS[0], t: 1 });

  const nextColor = useCallback(() => {
    const from = RAINBOW_COLORS[colorIdxRef.current];
    colorIdxRef.current = (colorIdxRef.current + 1) % RAINBOW_COLORS.length;
    const to = RAINBOW_COLORS[colorIdxRef.current];
    colorTransRef.current = { from, to, t: 0 };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth || 360;
    const H = mount.clientHeight || 260;

    // ── Renderer ──────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ── Scene & Camera ────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 5, 8);
    camera.lookAt(0, 0, 0);

    // ── Lights ────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 彩色点光源（跟随水色变化）
    const pointLight = new THREE.PointLight(0xff4444, 3, 12);
    pointLight.position.set(0, 4, 0);
    scene.add(pointLight);

    // ── 容器（玻璃杯效果）────────────────────────────────
    const TANK_W = 4, TANK_D = 3, TANK_H = 4;
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.12,
      roughness: 0,
      metalness: 0,
      transmission: 0.9,
      thickness: 0.1,
      side: THREE.DoubleSide,
    });

    // 四面玻璃墙
    const wallGeos = [
      { w: TANK_W, h: TANK_H, pos: [0, TANK_H / 2, TANK_D / 2], rot: [0, 0, 0] },
      { w: TANK_W, h: TANK_H, pos: [0, TANK_H / 2, -TANK_D / 2], rot: [0, Math.PI, 0] },
      { w: TANK_D, h: TANK_H, pos: [TANK_W / 2, TANK_H / 2, 0], rot: [0, -Math.PI / 2, 0] },
      { w: TANK_D, h: TANK_H, pos: [-TANK_W / 2, TANK_H / 2, 0], rot: [0, Math.PI / 2, 0] },
    ];
    wallGeos.forEach(({ w, h, pos, rot }) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, glassMat);
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.rotation.set(rot[0], rot[1], rot[2]);
      scene.add(mesh);
    });

    // 底部
    const floorGeo = new THREE.PlaneGeometry(TANK_W, TANK_D);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // ── 水体（动态平面，顶点着色器模拟波纹）────────────────
    const WATER_SEGS = 48;
    const waterGeo = new THREE.PlaneGeometry(TANK_W - 0.1, TANK_D - 0.1, WATER_SEGS, WATER_SEGS);
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(RAINBOW_COLORS[0].r, RAINBOW_COLORS[0].g, RAINBOW_COLORS[0].b),
      transparent: true,
      opacity: 0.82,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.3,
      thickness: 0.5,
      envMapIntensity: 1,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.01;
    scene.add(water);

    // 水面高光反射层
    const reflectGeo = new THREE.PlaneGeometry(TANK_W - 0.1, TANK_D - 0.1);
    const reflectMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
    });
    const reflectMesh = new THREE.Mesh(reflectGeo, reflectMat);
    reflectMesh.rotation.x = -Math.PI / 2;
    reflectMesh.position.y = 0.02;
    scene.add(reflectMesh);

    // ── 水滴（球体）──────────────────────────────────────
    const dropGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const dropMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const dropMat = new THREE.MeshPhysicalMaterial({
        color: 0xaaeeff,
        transparent: true,
        opacity: 0.85,
        roughness: 0,
        metalness: 0.1,
        transmission: 0.6,
      });
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      dropMeshes.push(m);
      dropletsRef.current.push({ x: 0, z: 0, y: TANK_H + 1, vy: 0, active: false, splashed: false });
    }

    // ── 涟漪（圆环扩散）──────────────────────────────────
    const rippleMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const rGeo = new THREE.RingGeometry(0.01, 0.08, 32);
      const rMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const rm = new THREE.Mesh(rGeo, rMat);
      rm.rotation.x = -Math.PI / 2;
      rm.visible = false;
      scene.add(rm);
      rippleMeshes.push(rm);
    }

    // ── 粒子飞溅 ──────────────────────────────────────────
    interface Particle { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; }
    const particleGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const particles: Particle[] = [];
    for (let i = 0; i < 30; i++) {
      const pMat = new THREE.MeshBasicMaterial({ color: 0xaaeeff, transparent: true, opacity: 0 });
      const pm = new THREE.Mesh(particleGeo, pMat);
      pm.visible = false;
      scene.add(pm);
      particles.push({ mesh: pm, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    let particleIdx = 0;

    const spawnParticles = (x: number, y: number, z: number, color: THREE.Color) => {
      for (let i = 0; i < 8; i++) {
        const p = particles[particleIdx % particles.length];
        particleIdx++;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 1.5;
        p.vx = Math.cos(angle) * speed * 0.4;
        p.vy = 1.5 + Math.random() * 2;
        p.vz = Math.sin(angle) * speed * 0.4;
        p.life = 1;
        p.mesh.position.set(x, y, z);
        (p.mesh.material as THREE.MeshBasicMaterial).color.copy(color);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
        p.mesh.visible = true;
      }
    };

    // ── 水位线（发光边框）────────────────────────────────
    const waterLevelLine = new THREE.Mesh(
      new THREE.PlaneGeometry(TANK_W - 0.1, 0.03),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
    );
    waterLevelLine.rotation.x = -Math.PI / 2;
    scene.add(waterLevelLine);

    // ── 动画循环 ──────────────────────────────────────────
    let lastTime = performance.now();
    let rippleSlot = 0;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // 颜色过渡
      const ct = colorTransRef.current;
      if (ct.t < 1) {
        ct.t = Math.min(ct.t + dt * 0.8, 1);
        const r = ct.from.r + (ct.to.r - ct.from.r) * ct.t;
        const g = ct.from.g + (ct.to.g - ct.from.g) * ct.t;
        const b = ct.from.b + (ct.to.b - ct.from.b) * ct.t;
        (waterMat.color as THREE.Color).setRGB(r, g, b);
        pointLight.color.setRGB(r, g, b);
      }

      // 水位上升
      const FILL_SPEED = 0.028;
      fillRef.current = Math.min(fillRef.current + dt * FILL_SPEED, 1);
      const waterY = fillRef.current * TANK_H;
      water.position.y = waterY;
      reflectMesh.position.y = waterY + 0.01;
      waterLevelLine.position.y = waterY + 0.01;

      // 水满 → 重置
      if (fillRef.current >= 1) {
        fillRef.current = 0;
        nextColor();
      }

      // 水滴生成
      dropTimerRef.current += dt;
      if (dropTimerRef.current >= DROP_INTERVAL) {
        dropTimerRef.current = 0;
        const slot = dropletsRef.current.findIndex(d => !d.active);
        if (slot >= 0) {
          const d = dropletsRef.current[slot];
          d.x = (Math.random() - 0.5) * (TANK_W - 0.5);
          d.z = (Math.random() - 0.5) * (TANK_D - 0.5);
          d.y = TANK_H + 0.5 + Math.random() * 0.5;
          d.vy = 0;
          d.active = true;
          d.splashed = false;
          dropMeshes[slot].visible = true;
        }
      }

      // 更新水滴
      dropletsRef.current.forEach((d, i) => {
        if (!d.active) return;
        d.vy -= 9.8 * dt;
        d.y += d.vy * dt;
        dropMeshes[i].position.set(d.x, d.y, d.z);

        // 水滴颜色跟随水色
        const wc = waterMat.color as THREE.Color;
        (dropMeshes[i].material as THREE.MeshPhysicalMaterial).color.copy(wc);

        if (d.y <= waterY + 0.12 && !d.splashed) {
          d.splashed = true;
          d.active = false;
          dropMeshes[i].visible = false;

          // 生成涟漪
          const rm = rippleMeshes[rippleSlot % rippleMeshes.length];
          rippleSlot++;
          rm.position.set(d.x, waterY + 0.02, d.z);
          rm.visible = true;
          ripplesRef.current.push({ x: d.x, z: d.z, age: 0, maxAge: 1.2, strength: 1 });

          // 飞溅粒子
          spawnParticles(d.x, waterY, d.z, wc);
        }
      });

      // 更新涟漪
      ripplesRef.current = ripplesRef.current.filter(r => r.age < r.maxAge);
      ripplesRef.current.forEach((r, i) => {
        r.age += dt;
        const progress = r.age / r.maxAge;
        const rm = rippleMeshes[i % rippleMeshes.length];
        const scale = 1 + progress * 6;
        rm.scale.set(scale, scale, scale);
        (rm.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.5;
      });

      // 更新粒子
      particles.forEach(p => {
        if (p.life <= 0) return;
        p.life -= dt * 1.5;
        p.vy -= 6 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life * 0.9);
        if (p.life <= 0) p.mesh.visible = false;
      });

      // 水面顶点波动
      const pos = waterGeo.attributes.position;
      const time = now / 1000;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getY(i); // PlaneGeometry Y = world Z after rotation
        let wave = 0;

        // 背景波纹
        wave += Math.sin(x * 1.5 + time * 1.2) * 0.025;
        wave += Math.cos(z * 1.8 + time * 0.9) * 0.02;

        // 涟漪叠加
        ripplesRef.current.forEach(r => {
          const dx = x - r.x;
          const dz = z - r.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const progress = r.age / r.maxAge;
          const waveFront = progress * 3;
          const diff = dist - waveFront;
          if (Math.abs(diff) < 0.6) {
            wave += Math.sin(diff * 8) * r.strength * (1 - progress) * 0.08;
          }
        });

        pos.setZ(i, wave);
      }
      pos.needsUpdate = true;
      waterGeo.computeVertexNormals();

      renderer.render(scene, camera);
    };

    animate();

    // ── 响应式 ────────────────────────────────────────────
    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [nextColor]);

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: '12px' }}
    />
  );
};

export default WaterAnimation3D;
