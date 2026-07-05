import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { getCountryTheme, getCountryThemeStyle } from '../countryTheme';
import { wordKey, wordText } from './wordDisplay';

export default function VisualCluster({ targetWords, country }) {
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
      color: new THREE.Color(getCountryTheme(country).palette.accent),
      size: 0.13,
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
  }, [country]);

  return (
    <div style={getCountryThemeStyle(country)} className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-[#07101d] p-3 sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(91,135,170,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(91,135,170,.055)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(30,100,145,.24),transparent_42%),radial-gradient(circle_at_25%_80%,rgba(255,154,77,.1),transparent_32%)]" />
      <div ref={mountRef} className="absolute inset-0 z-0" />
      <div className="z-10 flex w-[31rem] max-w-full flex-col items-center rounded-[1.5rem] border border-white/10 bg-[#0b1727]/88 px-5 py-6 shadow-[0_30px_100px_rgba(0,0,0,.5)] backdrop-blur-xl animate-fade-in-up sm:rounded-[2rem] sm:px-10 sm:py-9 [@media(max-height:600px)]:py-4">
        <p className="mb-4 font-display text-[8px] font-extrabold uppercase tracking-[.28em] text-[var(--accent)] sm:mb-6 sm:text-[9px] sm:tracking-[.35em]">Mission systems</p>
        <div className="relative mb-4 h-20 w-20 sm:mb-6 sm:h-24 sm:w-24 [@media(max-height:600px)]:h-16 [@media(max-height:600px)]:w-16">
          <div className="absolute inset-0 rotate-12 rounded-[1.75rem] border border-[var(--accent-25)] bg-[#07101d] shadow-inner" />
          <div className="absolute inset-3 rounded-2xl border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center"><span className="h-3 w-3 rounded-full bg-[var(--accent)]" /></div>
        </div>
        <h2 className="mb-2 text-center font-display text-xl font-extrabold text-white sm:text-2xl">
          {targetWords.length > 0 ? "Vocab Found!" : "Discovering Optimal Vocab..."}
        </h2>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.22em] animate-pulse">
          {targetWords.length > 0 ? "Preparing scenario" : "Intersecting Semantic Clusters"}
        </div>
        
        {targetWords.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {targetWords.map((w, index) => (
              <span key={wordKey(w, index)} className="rounded-xl border border-[var(--accent-20)] bg-[var(--accent-10)] px-3 py-1.5 text-sm font-bold text-[var(--accent-soft)]">
                {wordText(w)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
