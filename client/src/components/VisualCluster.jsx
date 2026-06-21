import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function VisualCluster({ targetWords }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 10;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Create a particle system
    const geometry = new THREE.BufferGeometry();
    const particleCount = 200;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 15;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 15;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({ 
      color: 0x1CB0F6, 
      size: 0.15, 
      transparent: true, 
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Highlight target words if they are fetched
    let highlightGroup = new THREE.Group();
    scene.add(highlightGroup);

    let frameId;
    function animate() {
      frameId = requestAnimationFrame(animate);
      points.rotation.y += 0.002;
      points.rotation.x += 0.001;
      highlightGroup.rotation.y -= 0.003;
      renderer.render(scene, camera);
    }
    animate();

    const handleResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 90% 60% at 50% 0%, #1E2C5A 0%, #131D3B 60%, #0D1530 100%)' }}
    >
      <div ref={mountRef} className="absolute inset-0 z-0" />
      <div className="z-10 flex flex-col items-center animate-fade-in-up bg-[#22305C]/80 px-8 py-7 rounded-[2rem] backdrop-blur-sm border-4 border-[#34457C] shadow-[0_8px_0_0_rgba(0,0,0,0.3)]">
        <div className="w-16 h-16 mb-4 relative">
          <div className="absolute inset-0 rounded-full border-4 border-[#34457C]"></div>
          <div className="absolute inset-0 rounded-full border-4 border-[#FFC93C] border-t-transparent animate-spin"></div>
        </div>
        <h2 className="text-2xl font-display font-black text-white mb-2 text-center">
          {targetWords.length > 0 ? "Words ready! 🎒" : "Packing your words…"}
        </h2>
        <div className="font-display text-xs font-extrabold text-[#FFC93C] uppercase tracking-wide animate-pulse">
          {targetWords.length > 0 ? "Setting up your adventure" : "Picking the perfect phrases"}
        </div>

        {targetWords.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {targetWords.map(w => (
              <span key={w.en} className="bg-[#2C3A63] text-sky-100 px-3.5 py-1.5 rounded-full text-sm font-display font-black border-[3px] border-[#34457C]">
                {w.zh}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
