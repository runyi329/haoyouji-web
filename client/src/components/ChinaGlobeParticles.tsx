import React, { useEffect, useRef } from 'react';

interface Particle {
  angle: number; // 角度
  radius: number; // 距离中心的半径
  speed: number; // 旋转速度
  size: number;
  opacity: number;
}

export default function ChinaGlobeParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();
  const rotationRef = useRef(0);

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

    // 初始化粒子（手机端优化：只用300个粒子）
    const initParticles = () => {
      particlesRef.current = [];
      const particleCount = 300; // 手机端减少粒子数量
      
      for (let i = 0; i < particleCount; i++) {
        // 粒子分布在圆形区域
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.3 + Math.random() * 0.15; // 相对半径 0.3-0.45
        
        particlesRef.current.push({
          angle,
          radius,
          speed: (Math.random() - 0.5) * 0.005, // 缓慢旋转
          size: 3 + Math.random() * 3, // 较大的粒子尺寸
          opacity: 0.5 + Math.random() * 0.5
        });
      }
    };

    initParticles();

    // 动画循环
    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const baseRadius = Math.min(rect.width, rect.height) * 0.35;

      // 清空画布
      ctx.clearRect(0, 0, rect.width, rect.height);

      // 绘制暗色地球轮廓
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30, 30, 50, 0.1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(100, 100, 150, 0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 全局旋转
      rotationRef.current += 0.002;

      // 绘制粒子（中国区域）
      particlesRef.current.forEach((particle) => {
        // 更新角度
        particle.angle += particle.speed;

        // 计算粒子位置
        const currentAngle = particle.angle + rotationRef.current;
        const x = centerX + Math.cos(currentAngle) * particle.radius * baseRadius;
        const y = centerY + Math.sin(currentAngle) * particle.radius * baseRadius;

        // 绘制粒子（渐变色：蓝到紫到粉）
        const colorProgress = (Math.sin(currentAngle) + 1) / 2;
        let color;
        if (colorProgress < 0.33) {
          color = `rgba(66, 133, 244, ${particle.opacity})`;
        } else if (colorProgress < 0.66) {
          color = `rgba(156, 39, 176, ${particle.opacity})`;
        } else {
          color = `rgba(244, 67, 54, ${particle.opacity})`;
        }

        // 绘制粒子（带光晕效果）
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, particle.size);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
        
        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
    />
  );
}
