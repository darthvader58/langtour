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
    <div className="w-full h-full relative bg-[#0F1418] flex flex-col items-center justify-center overflow-hidden">
      <div ref={mountRef} className="absolute inset-0 z-0" />
      <div className="z-10 flex flex-col items-center animate-fade-in-up bg-black/40 px-8 py-6 rounded-3xl backdrop-blur-sm border-2 border-[#37464F]">
        <div className="w-16 h-16 mb-4 relative">
          <div className="absolute inset-0 rounded-full border-4 border-[#1F2937]"></div>
          <div className="absolute inset-0 rounded-full border-4 border-[#1CB0F6] border-t-transparent animate-spin"></div>
        </div>
        <h2 className="text-2xl font-display font-extrabold text-white mb-2 text-center">
          {targetWords.length > 0 ? "Vocab Found!" : "Discovering Optimal Vocab..."}
        </h2>
        <div className="text-xs font-bold text-[#1CB0F6] uppercase tracking-[0.2em] animate-pulse">
          {targetWords.length > 0 ? "Preparing scenario" : "Intersecting Semantic Clusters"}
        </div>
        
        {targetWords.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {targetWords.map(w => (
              <span key={w.en} className="bg-[#1F2937] text-gray-300 px-3 py-1 rounded-full text-sm font-bold border border-[#37464F]">
                {w.zh}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
