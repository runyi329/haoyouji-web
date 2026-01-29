import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
}

interface ChinaMapParticlesProps {
  particleCount?: number;
  className?: string;
}

export default function ChinaMapParticles({ 
  particleCount = 2000,
  className = ''
}: ChinaMapParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置canvas尺寸
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 中国地图的大致轮廓点（简化版，使用相对坐标 0-1）
    const chinaOutline = [
      // 东北部
      [0.85, 0.15], [0.82, 0.18], [0.80, 0.22], [0.78, 0.25],
      // 华北
      [0.75, 0.28], [0.72, 0.30], [0.68, 0.32], [0.65, 0.35],
      // 华东
      [0.70, 0.40], [0.72, 0.45], [0.75, 0.50], [0.78, 0.55],
      // 华南
      [0.75, 0.60], [0.72, 0.65], [0.68, 0.70], [0.65, 0.72],
      // 西南
      [0.55, 0.75], [0.48, 0.72], [0.42, 0.68], [0.38, 0.65],
      // 西部
      [0.30, 0.60], [0.25, 0.55], [0.22, 0.50], [0.20, 0.45],
      // 西北
      [0.18, 0.38], [0.20, 0.32], [0.25, 0.28], [0.30, 0.25],
      // 北部
      [0.40, 0.20], [0.50, 0.18], [0.60, 0.17], [0.70, 0.16],
    ];

    // 初始化粒子
    const initParticles = () => {
      particlesRef.current = [];
      const rect = canvas.getBoundingClientRect();
      
      for (let i = 0; i < particleCount; i++) {
        // 在地图轮廓附近生成粒子
        const outlinePoint = chinaOutline[Math.floor(Math.random() * chinaOutline.length)];
        const offsetX = (Math.random() - 0.5) * 0.15; // 在轮廓点附近随机偏移
        const offsetY = (Math.random() - 0.5) * 0.15;
        
        const x = (outlinePoint[0] + offsetX) * rect.width;
        const y = (outlinePoint[1] + offsetY) * rect.height;
        
        // 根据位置生成渐变色（从蓝色到紫色到粉色）
        const colorProgress = outlinePoint[0]; // 使用x坐标作为颜色进度
        let color;
        if (colorProgress < 0.33) {
          // 蓝色
          color = `rgba(66, 133, 244, ${0.6 + Math.random() * 0.4})`;
        } else if (colorProgress < 0.66) {
          // 紫色
          color = `rgba(156, 39, 176, ${0.6 + Math.random() * 0.4})`;
        } else {
          // 粉色/橙色
          color = `rgba(244, 67, 54, ${0.6 + Math.random() * 0.4})`;
        }
        
        particlesRef.current.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 2, // 增加速度从0.2到2
          vy: (Math.random() - 0.5) * 2,
          color,
          size: Math.random() * 3 + 2 // 增大粒子尺寸
        });
      }
    };

    initParticles();
    console.log('ChinaMapParticles initialized with', particlesRef.current.length, 'particles');

    // 动画循环
    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // 绘制粒子
      particlesRef.current.forEach((particle) => {
        // 更新位置
        particle.x += particle.vx;
        particle.y += particle.vy;

        // 边界检测（保持在地图区域内）
        if (particle.x < rect.width * 0.15 || particle.x > rect.width * 0.90) {
          particle.vx *= -1;
        }
        if (particle.y < rect.height * 0.12 || particle.y > rect.height * 0.80) {
          particle.vy *= -1;
        }

        // 绘制粒子
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();
      });

      // 绘制连线（距离较近的粒子之间）
      const maxDistance = 80;
      for (let i = 0; i < particlesRef.current.length; i++) {
        for (let j = i + 1; j < particlesRef.current.length; j++) {
          const p1 = particlesRef.current[i];
          const p2 = particlesRef.current[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < maxDistance) {
            const opacity = (1 - distance / maxDistance) * 0.15;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(100, 100, 255, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    console.log('Starting animation loop');
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [particleCount]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ opacity: 0.6 }}
    />
  );
}
