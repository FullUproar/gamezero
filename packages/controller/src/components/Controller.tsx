import React, { useRef, useCallback, useEffect, useState } from 'react';
import type { Ship } from '@game-zero/shared';

interface ControllerProps {
  ship: Ship | null;
  onInput: (rotation: number, thrust: boolean, fire: boolean) => void;
}

export function Controller({ ship, onInput }: ControllerProps) {
  const [tiltValue, setTiltValue] = useState(0);
  const [thrustPressed, setThrustPressed] = useState(false);
  const [firePressed, setFirePressed] = useState(false);
  const [tiltStatus, setTiltStatus] = useState<'checking' | 'enabled' | 'unavailable'>('checking');

  const inputRef = useRef({ rotation: 0, thrust: false, fire: false });

  // Lock to landscape mode on mount (requires fullscreen on Android)
  useEffect(() => {
    const lockLandscape = async () => {
      try {
        // On Android, orientation lock requires fullscreen mode
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if ((docEl as any).webkitRequestFullscreen) {
          await (docEl as any).webkitRequestFullscreen();
        }

        // Now try to lock orientation
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock('landscape');
          console.log('Screen locked to landscape');
        }
      } catch (e) {
        // Orientation lock not supported or failed - that's OK
        console.log('Orientation lock not available:', e);
      }
    };

    // Attempt lock on first touch (needed for fullscreen permission)
    const handleFirstTouch = () => {
      lockLandscape();
      document.removeEventListener('touchstart', handleFirstTouch);
    };
    document.addEventListener('touchstart', handleFirstTouch, { once: true });

    // Also try immediately (may work on some browsers)
    lockLandscape();

    // Unlock when unmounting
    return () => {
      document.removeEventListener('touchstart', handleFirstTouch);
      if (screen.orientation && (screen.orientation as any).unlock) {
        (screen.orientation as any).unlock();
      }
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen();
      }
    };
  }, []);

  // Check tilt availability on mount
  useEffect(() => {
    try {
      // iOS 13+ requires user-gesture-triggered permission - show button
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        setTiltStatus('unavailable'); // Will show "tap to enable" button
      } else if (typeof DeviceOrientationEvent !== 'undefined') {
        // Non-iOS - just try to use it directly
        setTiltStatus('enabled');
      } else {
        setTiltStatus('unavailable');
      }
    } catch (e) {
      console.error('Tilt detection error:', e);
      setTiltStatus('unavailable');
    }
  }, []);

  // Listen to device orientation (steering only - thrust via button)
  useEffect(() => {
    if (tiltStatus !== 'enabled') return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      // In landscape mode, beta = left-right tilt (steering)
      const orientation = screen.orientation?.angle || (window.orientation as number) || 0;
      const isLandscape = Math.abs(orientation) === 90 || Math.abs(orientation) === 270;

      let steerTilt: number;
      if (isLandscape) {
        // Landscape: beta controls left-right tilt (steering)
        const beta = event.beta || 0;
        steerTilt = orientation === 90 || orientation === -270 ? beta : -beta;
      } else {
        // Portrait: gamma controls left-right tilt (inverted)
        steerTilt = -(event.gamma || 0);
      }

      // Dead zone around neutral position (ignore small tilts)
      const deadZone = 2; // degrees
      const maxTilt = 10; // degrees - full steering at 10° tilt (very sensitive)

      let normalizedSteer: number;
      if (Math.abs(steerTilt) < deadZone) {
        normalizedSteer = 0; // In dead zone - no steering
      } else {
        // Scale the remaining range (deadZone to maxTilt) to 0-1
        const adjustedTilt = (Math.abs(steerTilt) - deadZone) / (maxTilt - deadZone);
        normalizedSteer = Math.sign(steerTilt) * Math.min(1, adjustedTilt);
      }

      inputRef.current.rotation = normalizedSteer;
      setTiltValue(normalizedSteer);
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [tiltStatus]);

  // Send input at 30Hz
  useEffect(() => {
    const interval = setInterval(() => {
      onInput(inputRef.current.rotation, inputRef.current.thrust, inputRef.current.fire);
    }, 33);
    return () => clearInterval(interval);
  }, [onInput]);

  // Touch handlers
  const handleThrustStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    inputRef.current.thrust = true;
    setThrustPressed(true);
    if (navigator.vibrate) navigator.vibrate(10);
  }, []);

  const handleThrustEnd = useCallback(() => {
    inputRef.current.thrust = false;
    setThrustPressed(false);
  }, []);

  const handleFireStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    inputRef.current.fire = true;
    setFirePressed(true);
    if (navigator.vibrate) navigator.vibrate(15);
  }, []);

  const handleFireEnd = useCallback(() => {
    inputRef.current.fire = false;
    setFirePressed(false);
  }, []);

  // Reset button states when ship dies (prevents stuck buttons on respawn)
  useEffect(() => {
    if (ship && !ship.isAlive) {
      inputRef.current.thrust = false;
      inputRef.current.fire = false;
      setThrustPressed(false);
      setFirePressed(false);
    }
  }, [ship?.isAlive]);

  // Retry tilt permission (for iOS)
  const retryTilt = useCallback(async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission === 'granted') {
          setTiltStatus('enabled');
        }
      } catch (e) {
        console.log('Tilt permission failed:', e);
      }
    }
  }, []);

  // Dead screen
  if (ship && !ship.isAlive && ship.respawnTimer > 0) {
    return (
      <div style={containerStyle}>
        <div style={deadStyle}>
          <h1 style={{ color: '#FF6B6B', fontSize: '2rem' }}>DESTROYED</h1>
          <p style={{ color: '#888', marginTop: '1rem' }}>
            Respawning in {Math.ceil(ship.respawnTimer)}...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Ship color indicator */}
      {ship && (
        <div style={{ ...colorBarStyle, backgroundColor: ship.color }} />
      )}

      {/* Header overlay */}
      <div style={headerOverlayStyle}>
        <h2 style={{ color: '#4ECDC4', fontSize: '1rem', margin: 0, opacity: 0.7 }}>
          {ship?.name || 'CONTROLLER'}
        </h2>
        {ship && (
          <div style={scoreOverlayStyle}>
            {ship.score}
          </div>
        )}
      </div>

      {/* Tilt status / enable button */}
      {tiltStatus === 'unavailable' && (
        <button onClick={retryTilt} style={tiltButtonStyle}>
          👆 TAP TO ENABLE TILT
        </button>
      )}
      {tiltStatus === 'checking' && (
        <p style={{ color: '#888', fontSize: '0.8rem' }}>Checking tilt...</p>
      )}

      {/* Split-screen touch zones */}
      <div style={splitContainerStyle}>
        {/* Left half - THRUST */}
        <div
          style={{
            ...halfZoneStyle,
            backgroundColor: thrustPressed ? 'rgba(78, 205, 196, 0.3)' : 'rgba(78, 205, 196, 0.08)',
            borderRight: '1px solid #333',
          }}
          onTouchStart={handleThrustStart}
          onTouchEnd={handleThrustEnd}
          onTouchCancel={handleThrustEnd}
          onMouseDown={handleThrustStart}
          onMouseUp={handleThrustEnd}
          onMouseLeave={handleThrustEnd}
        >
          <span style={zoneIconStyle}>🚀</span>
          <span style={zoneLabelStyle}>THRUST</span>
        </div>

        {/* Right half - FIRE */}
        <div
          style={{
            ...halfZoneStyle,
            backgroundColor: firePressed ? 'rgba(255, 107, 107, 0.3)' : 'rgba(255, 107, 107, 0.08)',
          }}
          onTouchStart={handleFireStart}
          onTouchEnd={handleFireEnd}
          onTouchCancel={handleFireEnd}
          onMouseDown={handleFireStart}
          onMouseUp={handleFireEnd}
          onMouseLeave={handleFireEnd}
        >
          <span style={zoneIconStyle}>🔥</span>
          <span style={zoneLabelStyle}>FIRE</span>
        </div>
      </div>

      {/* Tilt indicator overlay */}
      <div style={tiltOverlayStyle}>
        <div style={tiltIndicatorStyle}>
          <div
            style={{
              ...tiltMarkerStyle,
              transform: `translateX(${tiltValue * 40}px)`,
              backgroundColor: tiltStatus === 'enabled' ? '#4ECDC4' : '#666',
            }}
          />
          <div style={tiltCenterStyle} />
        </div>
        <div style={steerLabelStyle}>
          {tiltStatus === 'enabled' ? 'TILT TO STEER' : 'TILT UNAVAILABLE'}
        </div>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  minHeight: '-webkit-fill-available', // iOS Safari fix
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0a0a12',
  position: 'fixed',
  top: 0,
  left: 0,
  overflow: 'hidden',
};

const colorBarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 4,
  zIndex: 10,
};

const headerOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  left: 0,
  right: 0,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 20px',
  zIndex: 10,
  pointerEvents: 'none',
};

const scoreOverlayStyle: React.CSSProperties = {
  color: '#FFE66D',
  fontSize: '1.5rem',
  fontWeight: 'bold',
  fontFamily: 'monospace',
};

const tiltIndicatorStyle: React.CSSProperties = {
  width: 120,
  height: 8,
  backgroundColor: '#1a1a2e',
  borderRadius: 4,
  position: 'relative',
  marginBottom: 20,
};

const tiltMarkerStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  position: 'absolute',
  top: -8,
  left: '50%',
  marginLeft: -12,
  transition: 'transform 0.05s ease-out',
  boxShadow: '0 0 15px rgba(78, 205, 196, 0.5)',
};

const tiltCenterStyle: React.CSSProperties = {
  width: 2,
  height: 16,
  backgroundColor: '#333',
  position: 'absolute',
  left: '50%',
  top: -4,
  marginLeft: -1,
};

const tiltButtonStyle: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  fontSize: '1rem',
  fontFamily: 'monospace',
  backgroundColor: '#4ECDC4',
  color: '#0a0a12',
  border: 'none',
  borderRadius: '8px',
  marginBottom: 20,
  cursor: 'pointer',
  fontWeight: 'bold',
  zIndex: 10,
};

const splitContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  zIndex: 1,
};

const halfZoneStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background-color 0.1s',
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
  userSelect: 'none',
  cursor: 'pointer',
};

const zoneIconStyle: React.CSSProperties = {
  fontSize: '4rem',
  marginBottom: '8px',
  opacity: 0.6,
};

const zoneLabelStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: 'bold',
  color: 'white',
  fontFamily: 'monospace',
  letterSpacing: '0.2em',
  opacity: 0.5,
};

const tiltOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 20,
  left: 0,
  right: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  zIndex: 5,
  pointerEvents: 'none',
};

const steerLabelStyle: React.CSSProperties = {
  color: '#444',
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  marginTop: 8,
};

const deadStyle: React.CSSProperties = {
  textAlign: 'center',
};
