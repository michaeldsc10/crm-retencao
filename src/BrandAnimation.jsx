import React, { useState, useRef, useEffect } from 'react';
import { Database, User, Cable } from 'lucide-react';

const initialNodes = [
  { id: 0, Icon: Database, left: 55, top: 50, isServer: true, connected: true },
  { id: 1, Icon: User, left: 45, top: 20, connected: false },
  { id: 2, Icon: User, left: 80, top: 25, connected: false },
  { id: 3, Icon: User, left: 35, top: 70, connected: false },
  { id: 4, Icon: User, left: 85, top: 65, connected: false },
  { id: 5, Icon: User, left: 65, top: 85, connected: false },
];

const BrandAnimation = () => {
  const containerRef = useRef(null);
  const [nodes, setNodes] = useState(initialNodes);
  const [lines, setLines] = useState([]); // { from: id, to: id }
  const [dragFrom, setDragFrom] = useState(null); // id
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [isCompleted, setIsCompleted] = useState(false);
  const [showLogo, setShowLogo] = useState(false);

  useEffect(() => {
    // Check if exactly all 5 users are connected
    const allConnected = nodes.every(n => n.connected);
    if (allConnected && !isCompleted && dragFrom === null) {
      setIsCompleted(true);
      setTimeout(() => setShowLogo(true), 1300);
    }
  }, [nodes, isCompleted, dragFrom]);

  const handlePointerDown = (e, id) => {
    if (isCompleted) return;
    const node = nodes.find(n => n.id === id);
    if (node && node.connected) {
      setDragFrom(id);
      updatePointerPos(e);
      // Lock scrolling by capturing pointer
      e.target.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerUp = (e) => {
    if (dragFrom !== null && e.target.hasPointerCapture(e.pointerId)) {
      e.target.releasePointerCapture(e.pointerId);
    }
    setDragFrom(null);
  };

  const updatePointerPos = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPointerPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handlePointerMove = (e) => {
    if (dragFrom === null || isCompleted) return;
    updatePointerPos(e);

    // Collision check
    const rect = containerRef.current.getBoundingClientRect();
    nodes.forEach(node => {
      if (!node.connected) {
        const nx = (node.left / 100) * rect.width;
        const ny = (node.top / 100) * rect.height;
        const dist = Math.hypot(nx - pointerPos.x, ny - pointerPos.y);
        
        if (dist < 40) { // Connect node if pointer is close
          setLines(prev => [...prev, { from: dragFrom, to: node.id }]);
          setNodes(prev => prev.map(n => n.id === node.id ? { ...n, connected: true } : n));
          setDragFrom(node.id); // Chain connection
        }
      }
    });
  };

  const getPercentageString = (id, axis) => {
    const node = nodes.find(n => n.id === id);
    return node ? `${node[axis]}%` : '0%';
  };

  return (
    <div 
      className="animation-container" 
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className={`suck-effect ${isCompleted ? 'active' : ''}`}></div>

      {/* SVG Background Lines rendering engine */}
      <svg className="svg-layer">
        {/* Placeholder broken data connections */}
        <line x1="50%" y1="45%" x2="0%" y2="10%" className="broken-data" />
        <line x1="50%" y1="45%" x2="100%" y2="10%" className="broken-data" />
        <line x1="50%" y1="45%" x2="100%" y2="100%" className="broken-data" />
        <line x1="50%" y1="45%" x2="0%" y2="100%" className="broken-data" />

        {/* Established Dynamic Paths */}
        {lines.map((l, i) => (
          <line
            key={`line-${i}`}
            className={`connection-line ${isCompleted ? 'sucked' : ''}`}
            x1={getPercentageString(l.from, 'left')}
            y1={getPercentageString(l.from, 'top')}
            x2={getPercentageString(l.to, 'left')}
            y2={getPercentageString(l.to, 'top')}
          />
        ))}

        {/* Active Drag Line */}
        {dragFrom !== null && (
          <line
            className="connection-line active-drag"
            x1={getPercentageString(dragFrom, 'left')}
            y1={getPercentageString(dragFrom, 'top')}
            x2={pointerPos.x}
            y2={pointerPos.y}
          />
        )}
      </svg>

      {/* Background Side Branding Text */}
      <div className="brand-overlay-text top-left">
        <div className="accent-line"></div>
        <h1 className="main-slogan">
          Relacionamento<br/>
          que gera<br/>
          <span className="gold-text">resultados.</span>
        </h1>
        <p className="sub-slogan">PLATAFORMA DE CRM PROFISSIONAL</p>
      </div>

      <div className="brand-overlay-text bottom-left">
        <div className="accent-border">
          <p>Gestão completa de leads.</p>
          <p>Seus clientes, vendas e métricas</p>
          <p>na mesma tela.</p>
        </div>
      </div>
      
      {/* Interaction Hint */}
      {!isCompleted && nodes.some(n => !n.connected) && (
        <div style={{ position: 'absolute', bottom: '18%', left: '53%', transform: 'translateX(-50%)', zIndex: 10, textAlign: 'center', pointerEvents: 'none' }}>
           <p style={{ color: 'rgba(59, 130, 246, 0.8)', fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase', fontSize: '0.8rem', animation: 'server-pulse 1.5s infinite alternate', whiteSpace: 'nowrap' }}>
             <Cable size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
             Conecte os dados para acessar
           </p>
        </div>
      )}

      {/* Nodes Array Map */}
      {nodes.map(node => (
        <div
          key={node.id}
          className={`interactive-node ${node.isServer ? 'server' : ''} ${node.connected ? 'connected' : ''} ${isCompleted ? 'sucked' : ''}`}
          style={{ top: `${node.top}%`, left: `${node.left}%` }}
          onPointerDown={(e) => handlePointerDown(e, node.id)}
        >
          <node.Icon size={node.isServer ? 50 : 35} strokeWidth={node.isServer ? 1 : 1.5} />
        </div>
      ))}

      {/* Logo Render */}
      <img 
        src="/logo.png" 
        alt="Assent Logo" 
        className={`logo-reveal ${showLogo ? 'visible' : ''}`} 
      />
    </div>
  );
};

export default BrandAnimation;
